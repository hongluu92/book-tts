import { collection, doc, getDocs, setDoc, getDoc, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { getCurrentUser } from './firebaseAuth'
import { BookLocal } from '@/storage/db'

export interface FirebaseBookMetadata {
  title: string
  author: string | null
  fileName: string
  fileSize: number
  mimeType: string
  addedAtMs: number
  updatedAtMs: number
}

// Load all bookshelf from Firebase
export async function loadBookshelfFromFirebase(): Promise<Record<string, FirebaseBookMetadata>> {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('User not authenticated')
  }

  const booksRef = collection(db, 'users', user.uid, 'books')
  const snapshot = await getDocs(booksRef)
  const books: Record<string, FirebaseBookMetadata> = {}

  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data()
    if (data.metadata) {
      books[docSnapshot.id] = data.metadata as FirebaseBookMetadata
    }
  })

  return books
}

// Sync single book metadata to Firebase
export async function syncBookMetadataToFirebase(book: BookLocal): Promise<void> {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('User not authenticated')
  }

  const bookRef = doc(db, 'users', user.uid, 'books', book.bookFingerprint)
  const bookDoc = await getDoc(bookRef)

  const metadata: FirebaseBookMetadata = {
    title: book.title,
    author: book.author || null,
    fileName: book.fileName,
    fileSize: book.fileSize,
    mimeType: book.mimeType,
    addedAtMs: book.addedAtMs,
    updatedAtMs: Date.now(),
  }

  // If book exists, only update if local is newer
  if (bookDoc.exists()) {
    const existing = bookDoc.data()
    if (existing.metadata && existing.metadata.updatedAtMs > book.addedAtMs) {
      // Remote is newer, don't overwrite
      return
    }
  }

  await setDoc(bookRef, { metadata }, { merge: true })
}

// Sync all local bookshelf to Firebase
export async function syncBookshelfToFirebase(books: BookLocal[]): Promise<void> {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('User not authenticated')
  }

  // Sync each book
  await Promise.all(books.map((book) => syncBookMetadataToFirebase(book)))

  // Update sync metadata
  await updateSyncMetadata()
}

// Merge local and remote bookshelf data
export function mergeBookshelfData(
  localBooks: BookLocal[],
  remoteBooks: Record<string, FirebaseBookMetadata>
): BookLocal[] {
  const localMap = new Map<string, BookLocal>()
  localBooks.forEach((book) => {
    localMap.set(book.bookFingerprint, book)
  })

  // Add remote books that don't exist locally (union merge)
  Object.entries(remoteBooks).forEach(([bookFingerprint, remoteMetadata]) => {
    if (!localMap.has(bookFingerprint)) {
      // New book from remote, add to local
      localMap.set(bookFingerprint, {
        bookFingerprint,
        title: remoteMetadata.title,
        author: remoteMetadata.author,
        addedAtMs: remoteMetadata.addedAtMs,
        fileName: remoteMetadata.fileName,
        fileSize: remoteMetadata.fileSize,
        mimeType: remoteMetadata.mimeType,
      })
    } else {
      // Book exists in both, use last-write-wins for metadata
      const local = localMap.get(bookFingerprint)!
      if (remoteMetadata.updatedAtMs > local.addedAtMs) {
        // Remote is newer, update local metadata
        local.title = remoteMetadata.title
        local.author = remoteMetadata.author
        local.fileName = remoteMetadata.fileName
        local.fileSize = remoteMetadata.fileSize
        local.mimeType = remoteMetadata.mimeType
      }
    }
  })

  return Array.from(localMap.values())
}

// Update sync metadata
async function updateSyncMetadata(): Promise<void> {
  const user = getCurrentUser()
  if (!user) {
    return
  }

  const userRef = doc(db, 'users', user.uid)
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
}
