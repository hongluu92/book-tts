'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Upload, Trash2 } from 'lucide-react'
import OfflineIndicator from '@/components/OfflineIndicator'
import DriveSyncButton from '@/components/DriveSyncButton'
import { db, BookLocal, BookCover } from '@/storage/db'
import { deleteLocalBook, importLocalEpub } from '@/lib/localLibrary'

interface BookWithCover extends BookLocal {
  coverUrl?: string | null
}

export default function BookshelfPageV2() {
  const [books, setBooks] = useState<BookWithCover[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [failedCovers, setFailedCovers] = useState<Set<string>>(new Set())

  const loadBooks = async () => {
    const list = await db.books.orderBy('addedAtMs').reverse().toArray()
    
    // Load covers for each book
    const booksWithCovers: BookWithCover[] = await Promise.all(
      list.map(async (book) => {
        const cover = await db.bookCovers.get(book.bookFingerprint)
        let coverUrl: string | null = null
        
        if (cover) {
          coverUrl = URL.createObjectURL(cover.blob)
        }
        
        return {
          ...book,
          coverUrl,
        }
      })
    )
    
    setBooks(booksWithCovers)
  }

  useEffect(() => {
    loadBooks()
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      books.forEach((book) => {
        if (book.coverUrl && book.coverUrl.startsWith('blob:')) {
          URL.revokeObjectURL(book.coverUrl)
        }
      })
    }
  }, [books])

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setImporting(true)
    try {
      const book = await importLocalEpub(file)
      // Immediately reflect new book in local state (v2 behaves like v1 UX)
      setBooks((prev) => [book, ...prev])
    } catch (err: any) {
      setError(err?.message || 'Import failed')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const confirmDelete = async (bookFingerprint: string) => {
    try {
      await deleteLocalBook(bookFingerprint)
      await loadBooks()
    } catch (err) {
      console.error(err)
      setError('Failed to delete book')
    } finally {
      setShowDeleteConfirm(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <OfflineIndicator />
      <header className="bg-white dark:bg-slate-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Books</h1>
          </div>
          <div className="flex items-center gap-4">
            <DriveSyncButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-500 dark:text-gray-400">Loading books...</div>
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="mx-auto h-12 w-12 text-gray-400 stroke-[1.5]" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No books</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Import your first EPUB to start reading offline.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {books.map((book) => (
              <div
                key={book.bookFingerprint}
                className="bg-white dark:bg-slate-800 rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden relative group"
              >
                <Link href={`/reader/${book.bookFingerprint}`} className="block">
                  <div className="aspect-[3/4] bg-gray-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                    {book.coverUrl && !failedCovers.has(book.bookFingerprint) ? (
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="w-full h-full object-cover"
                        onError={() => {
                          setFailedCovers((prev) => new Set(prev).add(book.bookFingerprint))
                        }}
                      />
                    ) : (
                      <BookOpen className="h-12 w-12 text-gray-400 stroke-[1.5]" />
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2">{book.title}</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-1">{book.fileName}</p>
                  </div>
                </Link>
                <button
                  onClick={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    setShowDeleteConfirm(book.bookFingerprint)
                  }}
                  className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete book"
                >
                  <Trash2 className="h-4 w-4 stroke-[2]" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="fixed bottom-6 right-6">
          <label className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg cursor-pointer flex items-center justify-center">
            <Upload className="h-6 w-6 stroke-[2]" />
            <input type="file" accept=".epub" onChange={handleImport} className="hidden" disabled={importing} />
          </label>
        </div>

        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Delete book?</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                This will remove the book file and any local progress from this device.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmDelete(showDeleteConfirm)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
