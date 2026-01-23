import Dexie, { Table } from 'dexie'

export interface Progress {
  id?: number
  bookId: string
  chapterId: string
  sentenceIndex: number
  markerId: string
  readerCfi?: string
  ttsVoice?: string
  ttsRate?: number
  updatedAt: Date
}

// v2 (client-only) models
export interface BookLocal {
  bookFingerprint: string
  title: string
  author?: string | null
  addedAtMs: number
  fileName: string
  fileSize: number
  mimeType: string
}

export interface BookFile {
  bookFingerprint: string
  blob: Blob
}

export interface V2Progress {
  id?: number
  bookFingerprint: string
  chapterId: string
  sentenceIndex: number
  markerId: string
  ttsVoice?: string
  ttsRate?: number
  updatedAtMs: number
}

export interface V2Chapter {
  id?: number
  bookFingerprint: string
  spineIndex: number
  chapterId: string
  title: string | null
  xhtmlHtml: string
}

export interface V2ImportStatus {
  bookFingerprint: string
  totalChapters: number
  parsedChapters: number
  updatedAtMs: number
  lastError?: string | null
}

class EpubReaderDB extends Dexie {
  progress!: Table<Progress>
  books!: Table<BookLocal>
  bookFiles!: Table<BookFile>
  v2Progress!: Table<V2Progress>
  v2Chapters!: Table<V2Chapter>
  v2ImportStatus!: Table<V2ImportStatus>

  constructor() {
    super('EpubReaderDB')
    this.version(1).stores({
      progress: '++id, bookId, chapterId, [bookId+chapterId], updatedAt',
    })

    // v2 tables (do not break v1 progress table)
    this.version(2).stores({
      progress: '++id, bookId, chapterId, [bookId+chapterId], updatedAt',
      books: 'bookFingerprint, addedAtMs, title',
      bookFiles: 'bookFingerprint',
      v2Progress: '++id, bookFingerprint, [bookFingerprint+chapterId], updatedAtMs',
    })

    // v3: add v2Chapters store (bump required for existing users who already have v2 DB without this store)
    this.version(3).stores({
      progress: '++id, bookId, chapterId, [bookId+chapterId], updatedAt',
      books: 'bookFingerprint, addedAtMs, title',
      bookFiles: 'bookFingerprint',
      v2Progress: '++id, bookFingerprint, [bookFingerprint+chapterId], updatedAtMs',
      v2Chapters: '++id, bookFingerprint, [bookFingerprint+spineIndex], chapterId',
    })

    // v4: add v2ImportStatus for background parsing progress
    this.version(4).stores({
      progress: '++id, bookId, chapterId, [bookId+chapterId], updatedAt',
      books: 'bookFingerprint, addedAtMs, title',
      bookFiles: 'bookFingerprint',
      v2Progress: '++id, bookFingerprint, [bookFingerprint+chapterId], updatedAtMs',
      v2Chapters: '++id, bookFingerprint, [bookFingerprint+spineIndex], chapterId',
      v2ImportStatus: 'bookFingerprint, updatedAtMs',
    })
  }
}

export const db = new EpubReaderDB()

// Helper functions
export async function getProgress(bookId: string, chapterId: string): Promise<Progress | undefined> {
  try {
    return await db.progress
      .where('[bookId+chapterId]')
      .equals([bookId, chapterId])
      .first()
  } catch (error) {
    console.error('Failed to get progress:', error)
    return undefined
  }
}

export async function getAllBookProgress(bookId: string): Promise<Progress[]> {
  try {
    return await db.progress.where('bookId').equals(bookId).toArray()
  } catch (error) {
    console.error('Failed to get book progress:', error)
    return []
  }
}
