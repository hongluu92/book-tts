import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'
import { getDbInstance } from './firebase'
import { getCurrentUser } from './firebaseAuth'
import { SentenceBookmark } from '@/storage/db'

export interface FirebaseBookmark {
  chapterId: string
  sentenceIndex: number
  markerId: string
  text: string
  createdAtMs: number
}

// Load bookmarks for a specific book from Firebase
export async function loadBookmarksFromFirebase(bookFingerprint: string): Promise<FirebaseBookmark[]> {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('User not authenticated')
  }

  const dbInstance = getDbInstance()
  if (!dbInstance) {
    throw new Error('Firebase is not initialized')
  }
  const bookRef = doc(dbInstance, 'users', user.uid, 'books', bookFingerprint)
  const bookDoc = await getDoc(bookRef)

  if (!bookDoc.exists()) {
    return []
  }

  const data = bookDoc.data()
  return (data.bookmarks || []) as FirebaseBookmark[]
}

// Load all bookmarks from Firebase
export async function loadAllBookmarksFromFirebase(): Promise<Record<string, FirebaseBookmark[]>> {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('User not authenticated')
  }

  const dbInstance = getDbInstance()
  if (!dbInstance) {
    throw new Error('Firebase is not initialized')
  }
  const booksRef = collection(dbInstance, 'users', user.uid, 'books')
  const snapshot = await getDocs(booksRef)
  const bookmarksMap: Record<string, FirebaseBookmark[]> = {}

  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data()
    if (data.bookmarks && Array.isArray(data.bookmarks)) {
      bookmarksMap[docSnapshot.id] = data.bookmarks as FirebaseBookmark[]
    }
  })

  return bookmarksMap
}

// Sync bookmarks to Firebase
export async function syncBookmarksToFirebase(bookFingerprint: string, bookmarks: SentenceBookmark[]): Promise<void> {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('User not authenticated')
  }

  const firebaseBookmarks: FirebaseBookmark[] = bookmarks.map((bm) => ({
    chapterId: bm.chapterId,
    sentenceIndex: bm.sentenceIndex,
    markerId: bm.markerId,
    text: bm.text,
    createdAtMs: bm.createdAtMs,
  }))

  const dbInstance = getDbInstance()
  if (!dbInstance) {
    throw new Error('Firebase is not initialized')
  }
  const bookRef = doc(dbInstance, 'users', user.uid, 'books', bookFingerprint)
  await setDoc(bookRef, { bookmarks: firebaseBookmarks }, { merge: true })
}

// Merge local and remote bookmarks (union merge with deduplicate)
export function mergeBookmarksData(
  localBookmarks: SentenceBookmark[],
  remoteBookmarks: Record<string, FirebaseBookmark[]>
): SentenceBookmark[] {
  const merged: SentenceBookmark[] = []
  const seen = new Set<string>()

  // Helper to create deduplication key
  const getKey = (bookFingerprint: string, chapterId: string, sentenceIndex: number) =>
    `${bookFingerprint}:${chapterId}:${sentenceIndex}`

  // Add local bookmarks
  localBookmarks.forEach((bm) => {
    const key = getKey(bm.bookFingerprint, bm.chapterId, bm.sentenceIndex)
    if (!seen.has(key)) {
      merged.push(bm)
      seen.add(key)
    }
  })

  // Add remote bookmarks (union merge)
  Object.entries(remoteBookmarks).forEach(([bookFingerprint, remoteBms]) => {
    remoteBms.forEach((remote) => {
      const key = getKey(bookFingerprint, remote.chapterId, remote.sentenceIndex)
      if (!seen.has(key)) {
        // New bookmark from remote
        merged.push({
          bookFingerprint,
          chapterId: remote.chapterId,
          sentenceIndex: remote.sentenceIndex,
          markerId: remote.markerId,
          text: remote.text,
          createdAtMs: remote.createdAtMs,
        })
        seen.add(key)
      } else {
        // Conflict: same position, different bookmark
        // Find existing and keep the one with newer createdAtMs
        const existingIndex = merged.findIndex(
          (bm) =>
            bm.bookFingerprint === bookFingerprint &&
            bm.chapterId === remote.chapterId &&
            bm.sentenceIndex === remote.sentenceIndex
        )
        if (existingIndex >= 0) {
          const existing = merged[existingIndex]
          if (remote.createdAtMs > existing.createdAtMs) {
            // Remote is newer, replace
            merged[existingIndex] = {
              bookFingerprint,
              chapterId: remote.chapterId,
              sentenceIndex: remote.sentenceIndex,
              markerId: remote.markerId,
              text: remote.text,
              createdAtMs: remote.createdAtMs,
            }
          }
        }
      }
    })
  })

  return merged
}
