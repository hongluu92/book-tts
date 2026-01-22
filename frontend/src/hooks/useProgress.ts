'use client'

import { useState, useEffect, useCallback } from 'react'
import { db, Progress } from '@/storage/db'

export function useProgress(bookId: string, chapterId: string) {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProgress = useCallback(async () => {
    if (!bookId || !chapterId) {
      setLoading(false)
      return
    }

    try {
      const saved = await db.progress
        .where('[bookId+chapterId]')
        .equals([bookId, chapterId])
        .first()

      if (saved) {
        setProgress(saved)
      }
    } catch (error) {
      console.error('Failed to load progress:', error)
    } finally {
      setLoading(false)
    }
  }, [bookId, chapterId])

  useEffect(() => {
    loadProgress()
  }, [loadProgress])

  const saveProgress = useCallback(
    async (data: Omit<Progress, 'id' | 'updatedAt'>) => {
      try {
        const existing = await db.progress
          .where('[bookId+chapterId]')
          .equals([data.bookId, data.chapterId])
          .first()

        const progressData: Progress = {
          ...data,
          updatedAt: new Date(),
        }

        if (existing) {
          await db.progress.update(existing.id!, progressData)
        } else {
          await db.progress.add(progressData)
        }

        setProgress(progressData)
      } catch (error) {
        console.error('Failed to save progress:', error)
        // Fallback to localStorage if IndexedDB fails
        try {
          localStorage.setItem(
            `progress_${data.bookId}_${data.chapterId}`,
            JSON.stringify({ ...data, updatedAt: new Date().toISOString() }),
          )
        } catch (localError) {
          console.error('Failed to save to localStorage:', localError)
        }
      }
    },
    [],
  )

  return {
    progress,
    loading,
    saveProgress,
    loadProgress,
  }
}
