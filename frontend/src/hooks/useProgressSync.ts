'use client'

import { useCallback, useRef } from 'react'
import { apiRequest } from '@/lib/api'

interface ProgressData {
  chapterId: string
  sentenceIndex: number
  markerId: string
  ttsVoice?: string
  ttsRate?: number
}

export function useProgressSync(bookId: string) {
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const syncProgress = useCallback(
    async (data: ProgressData) => {
      // Debounce sync (2-5s)
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }

      syncTimeoutRef.current = setTimeout(async () => {
        try {
          await apiRequest(`/books/${bookId}/progress`, {
            method: 'POST',
            body: JSON.stringify(data),
          })
        } catch (error) {
          // Best-effort sync - don't affect UX
          console.warn('Failed to sync progress:', error)
        }
      }, 3000) // 3 second debounce
    },
    [bookId],
  )

  const loadProgress = useCallback(async () => {
    try {
      return await apiRequest<ProgressData | null>(`/books/${bookId}/progress`)
    } catch (error) {
      // Best-effort - return null if fails
      console.warn('Failed to load progress:', error)
      return null
    }
  }, [bookId])

  return {
    syncProgress,
    loadProgress,
  }
}
