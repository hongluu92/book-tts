import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'
import { getDbInstance } from './firebase'
import { getCurrentUser } from './firebaseAuth'
import { V2Progress } from '@/storage/db'

export interface FirebaseProgress {
  chapterId: string
  sentenceIndex: number
  markerId: string
  ttsVoice?: string
  ttsRate?: number
  updatedAtMs: number
}

// Load progress for a specific book from Firebase
export async function loadProgressFromFirebase(bookFingerprint: string): Promise<FirebaseProgress | null> {
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
    return null
  }

  const data = bookDoc.data()
  return data.progress ? (data.progress as FirebaseProgress) : null
}

// Load all progress from Firebase
export async function loadAllProgressFromFirebase(): Promise<Record<string, FirebaseProgress>> {
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
  const progressMap: Record<string, FirebaseProgress> = {}

  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data()
    if (data.progress) {
      progressMap[docSnapshot.id] = data.progress as FirebaseProgress
    }
  })

  return progressMap
}

// Sync progress to Firebase
export async function syncProgressToFirebase(bookFingerprint: string, progress: V2Progress): Promise<void> {
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

  const firebaseProgress: FirebaseProgress = {
    chapterId: progress.chapterId,
    sentenceIndex: progress.sentenceIndex,
    markerId: progress.markerId,
    ttsVoice: progress.ttsVoice,
    ttsRate: progress.ttsRate,
    updatedAtMs: progress.updatedAtMs,
  }

  // If progress exists, only update if local is newer (last-write-wins)
  if (bookDoc.exists()) {
    const existing = bookDoc.data()
    if (existing.progress && existing.progress.updatedAtMs > progress.updatedAtMs) {
      // Remote is newer, don't overwrite
      return
    }
  }

  await setDoc(bookRef, { progress: firebaseProgress }, { merge: true })
}

// Merge local and remote progress data
export function mergeProgressData(
  localProgress: V2Progress[],
  remoteProgress: Record<string, FirebaseProgress>
): V2Progress[] {
  const merged: V2Progress[] = []
  const localMap = new Map<string, V2Progress>()

  // Index local progress by bookFingerprint
  localProgress.forEach((p) => {
    localMap.set(p.bookFingerprint, p)
  })

  // Process remote progress
  Object.entries(remoteProgress).forEach(([bookFingerprint, remote]) => {
    const local = localMap.get(bookFingerprint)

    if (!local) {
      // Only remote, add it
      merged.push({
        bookFingerprint,
        chapterId: remote.chapterId,
        sentenceIndex: remote.sentenceIndex,
        markerId: remote.markerId,
        ttsVoice: remote.ttsVoice,
        ttsRate: remote.ttsRate,
        updatedAtMs: remote.updatedAtMs,
      })
    } else {
      // Both exist, use last-write-wins
      if (remote.updatedAtMs > local.updatedAtMs) {
        // Remote is newer
        merged.push({
          bookFingerprint,
          chapterId: remote.chapterId,
          sentenceIndex: remote.sentenceIndex,
          markerId: remote.markerId,
          ttsVoice: remote.ttsVoice,
          ttsRate: remote.ttsRate,
          updatedAtMs: remote.updatedAtMs,
        })
      } else {
        // Local is newer
        merged.push(local)
      }
    }
  })

  // Add local-only progress
  localProgress.forEach((local) => {
    if (!remoteProgress[local.bookFingerprint]) {
      merged.push(local)
    }
  })

  return merged
}
