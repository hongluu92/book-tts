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

class EpubReaderDB extends Dexie {
  progress!: Table<Progress>

  constructor() {
    super('EpubReaderDB')
    this.version(1).stores({
      progress: '++id, bookId, chapterId, [bookId+chapterId], updatedAt',
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
