'use client'

import { useEffect, useState } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import OfflineIndicator from '@/components/OfflineIndicator'
import { apiRequest, apiDelete } from '@/lib/api'
import { logout, getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpTrayIcon, BookOpenIcon, TrashIcon } from '@heroicons/react/24/outline'
import AuthImage from '@/components/AuthImage'

interface Book {
  id: string
  title: string
  author: string | null
  coverUrl: string | null
  _count: {
    chapters: number
  }
}

export default function BookshelfPage() {
  const router = useRouter()
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    loadBooks()
  }, [])

  const loadBooks = async () => {
    try {
      const data = await apiRequest<Book[]>('/books')
      setBooks(data)
    } catch (error) {
      console.error('Failed to load books:', error)
      // Try to load from cache if offline
      if (!isOnline) {
        // Could implement cache loading here
      }
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!isOnline) {
      alert('Cannot upload while offline')
      return
    }

    if (!file.name.endsWith('.epub')) {
      alert('Please select an EPUB file')
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      alert('File size exceeds 50MB limit')
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      const { apiUpload } = await import('@/lib/api')
      const result = await apiUpload('/books/import', file, (progress) => {
        setUploadProgress(progress)
      })

      await loadBooks()
      setUploading(false)
      setUploadProgress(0)
      
      // Navigate to book
      router.push(`/reader/${result.bookId}`)
    } catch (error: any) {
      alert(error.message || 'Upload failed')
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const handleDeleteClick = (e: React.MouseEvent, bookId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDeleteConfirm(bookId)
  }

  const handleDeleteConfirm = async (bookId: string) => {
    if (!isOnline) {
      alert('Cannot delete while offline')
      return
    }

    setDeletingBookId(bookId)
    setShowDeleteConfirm(null)

    try {
      await apiDelete(`/books/${bookId}`)
      await loadBooks()
    } catch (error: any) {
      alert(error.message || 'Failed to delete book')
    } finally {
      setDeletingBookId(null)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(null)
  }

  const user = getCurrentUser()

  return (
    <ProtectedRoute>
      <OfflineIndicator />
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
        <header className="bg-white dark:bg-slate-800 shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Books</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-400">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="text-center py-12">
              <div className="text-gray-500 dark:text-gray-400">Loading books...</div>
            </div>
          ) : books.length === 0 ? (
            <div className="text-center py-12">
              <BookOpenIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No books</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Get started by uploading your first EPUB book.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {books.map((book) => (
                <div
                  key={book.id}
                  className="bg-white dark:bg-slate-800 rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden relative group"
                >
                  <Link
                    href={`/reader/${book.id}`}
                    className="block"
                  >
                    <div className="aspect-[3/4] bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
                      {book.coverUrl ? (
                        <AuthImage
                          src={book.coverUrl}
                          alt={book.title}
                          className="w-full h-full object-cover"
                          fallback={<BookOpenIcon className="h-12 w-12 text-gray-400" />}
                        />
                      ) : (
                        <BookOpenIcon className="h-12 w-12 text-gray-400" />
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2">
                        {book.title}
                      </h3>
                      {book.author && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                          {book.author}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {book._count.chapters} chapters
                      </p>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => handleDeleteClick(e, book.id)}
                    disabled={deletingBookId === book.id || !isOnline}
                    className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete book"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload FAB */}
          <div className="fixed bottom-6 right-6">
            <label
              className={`bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg cursor-pointer flex items-center justify-center ${
                !isOnline ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <ArrowUpTrayIcon className="h-6 w-6" />
              <input
                type="file"
                accept=".epub"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading || !isOnline}
              />
            </label>
          </div>

          {/* Upload Progress Modal */}
          {uploading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Uploading EPUB...
                </h3>
                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 text-center">
                  {Math.round(uploadProgress)}%
                </p>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Delete Book?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Are you sure you want to delete this book? This action cannot be undone and will delete all chapters, progress, and related files.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={handleDeleteCancel}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteConfirm(showDeleteConfirm)}
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
    </ProtectedRoute>
  )
}
