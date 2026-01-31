'use client'

import { useState, useCallback, useRef } from 'react'
import { getCurrentUser } from '@/lib/firebaseAuth'
import { loadBookshelfFromFirebase, syncBookshelfToFirebase, mergeBookshelfData } from '@/lib/firebaseBookshelf'
import { loadAllProgressFromFirebase, syncProgressToFirebase, mergeProgressData } from '@/lib/firebaseProgress'
import { loadAllBookmarksFromFirebase, syncBookmarksToFirebase, mergeBookmarksData } from '@/lib/firebaseBookmarks'
import { loadSettingsFromFirebase, mergeSettingsData } from '@/lib/firebaseSettings'
import { db, BookLocal, V2Progress, SentenceBookmark } from '@/storage/db'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db as firestoreDb } from '@/lib/firebase'

export interface SyncStatus {
  hasNewData: boolean
  lastSyncAtMs: number
  lastLocalChangeAtMs: number
}

export function useFirebaseSync() {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pushTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Check for new data on Firebase
  const checkForNewData = useCallback(async (): Promise<SyncStatus> => {
    const user = getCurrentUser()
    if (!user) {
      return { hasNewData: false, lastSyncAtMs: 0, lastLocalChangeAtMs: 0 }
    }

    try {
      const userRef = doc(firestoreDb, 'users', user.uid)
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
      const userRef = doc(firestoreDb, 'users', user.uid)
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

      // Clear existing timeout
      if (pushTimeoutRef.current) {
        clearTimeout(pushTimeoutRef.current)
      }

      // Debounce push
      pushTimeoutRef.current = setTimeout(async () => {
        try {
          await syncProgressToFirebase(progress.bookFingerprint, progress)
        } catch (err) {
          console.warn('Failed to auto-push progress:', err)
        }
      }, 3000)
    },
    []
  )

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
  }
}
