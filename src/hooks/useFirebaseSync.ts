'use client'

import { useState, useCallback, useRef } from 'react'
import { getCurrentUser } from '@/lib/firebaseAuth'
import { loadBookshelfFromFirebase, syncBookshelfToFirebase, mergeBookshelfData } from '@/lib/firebaseBookshelf'
import { loadAllProgressFromFirebase, syncProgressToFirebase, mergeProgressData } from '@/lib/firebaseProgress'
import { loadAllBookmarksFromFirebase, syncBookmarksToFirebase, mergeBookmarksData } from '@/lib/firebaseBookmarks'
import { loadSettingsFromFirebase, mergeSettingsData } from '@/lib/firebaseSettings'
import { db, BookLocal, V2Progress, SentenceBookmark } from '@/storage/db'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getDbInstance } from '@/lib/firebase'

export interface SyncStatus {
  hasNewData: boolean
  lastSyncAtMs: number
  lastLocalChangeAtMs: number
}

export function useFirebaseSync() {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pushTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const progressTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const latestProgressRef = useRef<V2Progress | null>(null)

  // Check for new data on Firebase
  const checkForNewData = useCallback(async (): Promise<SyncStatus> => {
    const user = getCurrentUser()
    if (!user) {
      return { hasNewData: false, lastSyncAtMs: 0, lastLocalChangeAtMs: 0 }
    }

    try {
      const dbInstance = getDbInstance()
      if (!dbInstance) {
        return { hasNewData: false, lastSyncAtMs: 0, lastLocalChangeAtMs: 0 }
      }
      const userRef = doc(dbInstance, 'users', user.uid)
      const userDoc = await getDoc(userRef)

      if (!userDoc.exists()) {
        return { hasNewData: false, lastSyncAtMs: 0, lastLocalChangeAtMs: 0 }
      }

      const data = userDoc.data()
      const syncMetadata = data.syncMetadata || {}
      const lastSyncAtMs = syncMetadata.lastSyncAtMs || 0
      const lastLocalChangeAtMs = syncMetadata.lastLocalChangeAtMs || 0

      // Check if remote has newer data
      const hasNewData = lastLocalChangeAtMs > lastSyncAtMs

      return { hasNewData, lastSyncAtMs, lastLocalChangeAtMs }
    } catch (err: any) {
      console.error('Failed to check for new data:', err)
      return { hasNewData: false, lastSyncAtMs: 0, lastLocalChangeAtMs: 0 }
    }
  }, [])

  // Full sync: Pull → Merge → Push
  const syncNow = useCallback(async (): Promise<void> => {
    const user = getCurrentUser()
    if (!user) {
      throw new Error('User not authenticated')
    }

    setSyncing(true)
    setError(null)

    try {
      // Pull phase: Load all from Firebase
      const [remoteBooks, remoteProgress, remoteBookmarks, remoteSettings] = await Promise.all([
        loadBookshelfFromFirebase(),
        loadAllProgressFromFirebase(),
        loadAllBookmarksFromFirebase(),
        loadSettingsFromFirebase(),
      ])

      // Load local data
      const localBooks = await db.books.toArray()
      const localProgress = await db.v2Progress.toArray()
      const localBookmarks = await db.sentenceBookmarks.toArray()

      // Merge phase
      const mergedBooks = mergeBookshelfData(localBooks, remoteBooks)
      const mergedProgress = mergeProgressData(localProgress, remoteProgress)
      const mergedBookmarks = mergeBookmarksData(localBookmarks, remoteBookmarks)

      // Save merged data to local DB
      await db.transaction('rw', db.books, db.v2Progress, db.sentenceBookmarks, async () => {
        // Update books
        for (const book of mergedBooks) {
          await db.books.put(book)
        }

        // Update progress
        for (const progress of mergedProgress) {
          await db.v2Progress.put(progress)
        }

        // Update bookmarks
        for (const bookmark of mergedBookmarks) {
          await db.sentenceBookmarks.put(bookmark)
        }
      })

      // Push phase: Upload local changes to Firebase
      await syncBookshelfToFirebase(localBooks)
      await Promise.all(
        localProgress.map((p) => syncProgressToFirebase(p.bookFingerprint, p))
      )
      await Promise.all(
        Array.from(new Set(localBookmarks.map((bm) => bm.bookFingerprint))).map((bookFingerprint) => {
          const bookBookmarks = localBookmarks.filter((bm) => bm.bookFingerprint === bookFingerprint)
          return syncBookmarksToFirebase(bookFingerprint, bookBookmarks)
        })
      )

      // Update sync metadata
      const dbInstance = getDbInstance()
      if (!dbInstance) {
        return // Firebase not initialized, skip metadata update
      }
      const userRef = doc(dbInstance, 'users', user.uid)
      await setDoc(
        userRef,
        {
          syncMetadata: {
            lastSyncAtMs: Date.now(),
            lastLocalChangeAtMs: Date.now(),
          },
        },
        { merge: true }
      )
    } catch (err: any) {
      const errorMessage = err.message || 'Sync failed'
      setError(errorMessage)
      throw err
    } finally {
      setSyncing(false)
    }
  }, [])

  // Auto-push single progress update (debounced)
  const autoPushProgress = useCallback(
    async (progress: V2Progress) => {
      const user = getCurrentUser()
      if (!user) {
        return // Not authenticated, skip
      }

      // Store the latest progress to ensure we always sync the most recent one
      latestProgressRef.current = progress

      // Clear existing timeout
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current)
      }

      // Debounce push - always sync the latest progress
      progressTimeoutRef.current = setTimeout(async () => {
        const progressToSync = latestProgressRef.current
        if (!progressToSync) {
          return
        }

        try {
          // Get the latest progress from local DB to ensure we have the most up-to-date data
          const latestFromDb = await db.v2Progress.get(progressToSync.bookFingerprint)
          const finalProgress = latestFromDb || progressToSync
          
          await syncProgressToFirebase(finalProgress.bookFingerprint, finalProgress)
          latestProgressRef.current = null // Clear after successful sync
        } catch (err) {
          console.warn('Failed to auto-push progress:', err)
          // Keep progress in ref so we can retry later
        }
      }, 2000) // Reduced from 3000ms to 2000ms for faster sync
    },
    []
  )

  // Flush pending progress sync (call this on unmount or when stopping)
  const flushProgress = useCallback(async () => {
    if (progressTimeoutRef.current) {
      clearTimeout(progressTimeoutRef.current)
      progressTimeoutRef.current = null
    }

    const progressToSync = latestProgressRef.current
    if (!progressToSync) {
      return
    }

    const user = getCurrentUser()
    if (!user) {
      return
    }

    try {
      // Get the latest progress from local DB
      const latestFromDb = await db.v2Progress.get(progressToSync.bookFingerprint)
      const finalProgress = latestFromDb || progressToSync
      
      await syncProgressToFirebase(finalProgress.bookFingerprint, finalProgress)
      latestProgressRef.current = null
    } catch (err) {
      console.warn('Failed to flush progress:', err)
    }
  }, [])

  // Auto-push bookmarks for a book (debounced)
  const autoPushBookmarks = useCallback(
    async (bookFingerprint: string, bookmarks: SentenceBookmark[]) => {
      const user = getCurrentUser()
      if (!user) {
        return // Not authenticated, skip
      }

      // Clear existing timeout
      if (pushTimeoutRef.current) {
        clearTimeout(pushTimeoutRef.current)
      }

      // Debounce push
      pushTimeoutRef.current = setTimeout(async () => {
        try {
          await syncBookmarksToFirebase(bookFingerprint, bookmarks)
        } catch (err) {
          console.warn('Failed to auto-push bookmarks:', err)
        }
      }, 3000)
    },
    []
  )

  // Auto-push bookshelf change (debounced)
  const autoPushBookshelf = useCallback(
    async (books: BookLocal[]) => {
      const user = getCurrentUser()
      if (!user) {
        return // Not authenticated, skip
      }

      // Clear existing timeout
      if (pushTimeoutRef.current) {
        clearTimeout(pushTimeoutRef.current)
      }

      // Debounce push
      pushTimeoutRef.current = setTimeout(async () => {
        try {
          await syncBookshelfToFirebase(books)
        } catch (err) {
          console.warn('Failed to auto-push bookshelf:', err)
        }
      }, 3000)
    },
    []
  )

  return {
    syncing,
    error,
    syncNow,
    checkForNewData,
    autoPushProgress,
    autoPushBookmarks,
    autoPushBookshelf,
    flushProgress,
  }
}
