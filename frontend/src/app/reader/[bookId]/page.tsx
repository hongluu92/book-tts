'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import TtsControls from '@/components/TtsControls'
import { apiRequest } from '@/lib/api'
import { useTts } from '@/hooks/useTts'
import { useSentenceHighlight } from '@/hooks/useSentenceHighlight'
import { useProgress } from '@/hooks/useProgress'
import { useProgressSync } from '@/hooks/useProgressSync'
import { Sentence } from '@/lib/tts/types'
import { db } from '@/storage/db'

interface Chapter {
  id: string
  spineIndex: number
  title: string | null
  xhtmlUrl: string | null
}

interface Book {
  id: string
  title: string
  chapters: Chapter[]
}

interface SentencesResponse {
  sentences: Array<{
    sentenceIndex: number
    text: string
    markerId: string
  }>
}

export default function ReaderPage() {
  const params = useParams()
  const router = useRouter()
  const bookId = params.bookId as string
  
  // Track if component is mounted to prevent cleanup on initial mount
  const isMountedRef = useRef(true)
  const [book, setBook] = useState<Book | null>(null)
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [chapterContent, setChapterContent] = useState<string>('')
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingSentences, setLoadingSentences] = useState(false)
  const [sentencesError, setSentencesError] = useState<string | null>(null)
  const [reprocessing, setReprocessing] = useState(false)
  const [fontSize, setFontSize] = useState(18)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [showSettings, setShowSettings] = useState(false)

  const currentChapter = book?.chapters[currentChapterIndex]
  const { progress, saveProgress } = useProgress(bookId, currentChapter?.id || '')
  const { syncProgress } = useProgressSync(bookId)

  const {
    isPlaying,
    isPaused,
    currentSentenceIndex,
    voices,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    voicesLoading,
    play,
    pause,
    stop,
    seek,
    prev,
    next,
    isSupported,
  } = useTts({
    sentences,
    onSentenceStart: (sentence) => {
      // Save progress locally
      if (currentChapter) {
        saveProgress({
          bookId,
          chapterId: currentChapter.id,
          sentenceIndex: sentence.sentenceIndex,
          markerId: sentence.markerId,
          ttsVoice: selectedVoice?.name,
          ttsRate: rate,
        })

        // Sync to backend (best-effort, debounced)
        syncProgress({
          chapterId: currentChapter.id,
          sentenceIndex: sentence.sentenceIndex,
          markerId: sentence.markerId,
          ttsVoice: selectedVoice?.name,
          ttsRate: rate,
        })
      }
    },
    onProgress: (index) => {
      // Progress callback
    },
  })

  const contentRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  
  const currentMarkerId = sentences[currentSentenceIndex]?.markerId || null
  
  // Debug: log when sentence changes
  useEffect(() => {
    if (currentSentenceIndex >= 0 && sentences.length > 0 && currentSentenceIndex < sentences.length) {
      const sentence = sentences[currentSentenceIndex]
      if (sentence) {
        console.log(`[ReaderPage] Current sentence:`, {
          index: currentSentenceIndex,
          markerId: sentence.markerId,
          text: sentence.text.substring(0, 50),
          totalSentences: sentences.length
        })
      }
    }
  }, [currentSentenceIndex, sentences])
  
  useSentenceHighlight(
    contentRef,
    currentMarkerId,
    isPlaying && !isPaused,
    mainRef, // Pass scroll container ref for better scroll control
  )

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('reader-theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    }

    // Load font size from localStorage
    const savedFontSize = localStorage.getItem('reader-font-size')
    if (savedFontSize) {
      setFontSize(parseInt(savedFontSize, 10))
    }

    loadBook()

    // Cleanup: Stop TTS when component unmounts or route changes
    return () => {
      console.log('[ReaderPage] Component unmounting or route changing, stopping TTS')
      stop()
      isMountedRef.current = false
    }
  }, [bookId, stop])

  // Additional cleanup on unmount (separate effect to ensure it runs)
  useEffect(() => {
    isMountedRef.current = true
    
    return () => {
      console.log('[ReaderPage] Final cleanup on unmount, stopping TTS')
      if (isMountedRef.current) {
        stop()
        // Also cancel speech synthesis directly as a safety measure
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          speechSynthesis.cancel()
        }
      }
    }
  }, [stop])

  // Find the last read chapter
  const findLastReadChapter = useCallback(async () => {
    if (!book || book.chapters.length === 0) return null

    try {
      // Get all progress entries for this book
      const allProgress = await db.progress
        .where('bookId')
        .equals(bookId)
        .toArray()

      if (allProgress.length === 0) return null

      // Find the most recent progress
      const lastProgress = allProgress.sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return dateB - dateA
      })[0]

      // Find chapter index
      const chapterIndex = book.chapters.findIndex(
        (ch) => ch.id === lastProgress.chapterId
      )

      return chapterIndex >= 0 ? chapterIndex : null
    } catch (error) {
      console.error('Failed to find last read chapter:', error)
      return null
    }
  }, [book, bookId])

  useEffect(() => {
    if (book && book.chapters.length > 0) {
      // Check if we should jump to last read chapter
      if (currentChapterIndex === 0) {
        findLastReadChapter().then((lastChapterIndex) => {
          if (lastChapterIndex !== null && lastChapterIndex !== 0) {
            console.log(`[ReaderPage] Jumping to last read chapter: ${lastChapterIndex}`)
            setCurrentChapterIndex(lastChapterIndex)
          } else {
            loadChapter(currentChapterIndex)
          }
        })
      } else {
        loadChapter(currentChapterIndex)
      }
    }
  }, [book, currentChapterIndex, findLastReadChapter])

  // Reset TTS when chapter changes
  useEffect(() => {
    if (currentChapter) {
      console.log(`[ReaderPage] Chapter changed to: ${currentChapter.id}, resetting TTS`)
      stop()
      // TTS state will be reset by useTts hook when sentences change
    }
  }, [currentChapter?.id, stop])

  // Track previous chapter to detect changes
  const prevChapterIdRef = useRef<string | null>(null)

  // Resume from progress when chapter loads (after TTS reset)
  useEffect(() => {
    const chapterChanged = prevChapterIdRef.current !== currentChapter?.id
    
    if (chapterChanged) {
      console.log(`[ReaderPage] Chapter changed from ${prevChapterIdRef.current} to ${currentChapter?.id}, resetting TTS and scrolling to top`)
      prevChapterIdRef.current = currentChapter?.id || null
      
      // Scroll to top of chapter
      if (mainRef.current) {
        mainRef.current.scrollTo({
          top: 0,
          behavior: 'smooth',
        })
      }
      
      // Reset to start - progress will be applied in next effect if available
      if (sentences.length > 0) {
        seek(0)
      }
      return
    }

    // Only resume progress if we have sentences and we're at the start (after reset)
    if (progress && sentences.length > 0 && currentSentenceIndex === 0) {
      const index = sentences.findIndex((s) => s.markerId === progress.markerId)
      if (index >= 0 && index > 0) {
        // Seek to saved position (but don't auto-play - iOS requires user interaction)
        console.log(`[ReaderPage] Resuming from progress: sentence ${index}`)
        seek(index)
        
        // Scroll to the sentence (useSentenceHighlight will handle scrolling)
        // But also ensure we scroll after a delay to let content render
        setTimeout(() => {
          const element = contentRef.current?.querySelector(`#${progress.markerId}`)
          if (element && mainRef.current) {
            const elementRect = element.getBoundingClientRect()
            const containerRect = mainRef.current.getBoundingClientRect()
            const scrollTop = mainRef.current.scrollTop + elementRect.top - containerRect.top - (containerRect.height / 2) + (elementRect.height / 2)
            
            mainRef.current.scrollTo({
              top: scrollTop,
              behavior: 'smooth',
            })
          }
        }, 300)
        
        // Restore TTS settings if available
        if (progress.ttsVoice && selectedVoice?.name !== progress.ttsVoice) {
          const voice = voices.find((v) => v.name === progress.ttsVoice)
          if (voice) {
            setSelectedVoice(voice)
          }
        }
        if (progress.ttsRate !== undefined && progress.ttsRate !== rate) {
          setRate(progress.ttsRate)
        }
      }
    } else if (sentences.length > 0 && currentSentenceIndex !== 0 && !progress) {
      // No progress for this chapter, ensure we're at the start
      console.log('[ReaderPage] No progress, resetting to start')
      seek(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, sentences, currentChapter?.id, currentSentenceIndex])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('reader-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('reader-font-size', fontSize.toString())
    if (contentRef.current) {
      contentRef.current.style.fontSize = `${fontSize}px`
    }
  }, [fontSize])

  const loadBook = async () => {
    try {
      const data = await apiRequest<Book>(`/books/${bookId}`)
      setBook(data)
    } catch (error) {
      console.error('Failed to load book:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadChapter = async (index: number) => {
    if (!book || !book.chapters[index]) return

    const chapter = book.chapters[index]
    if (!chapter.xhtmlUrl) return

    try {
      // Stop and reset TTS completely
      stop()
      
      // Reset TTS state by seeking to 0 (this will reset currentSentenceIndex)
      // Note: This needs to happen after sentences are loaded, so we'll do it in useEffect
      
      // Reset sentences state
      setSentences([])
      setSentencesError(null)
      setLoadingSentences(true)

      // Load chapter XHTML
      const token = localStorage.getItem('accessToken')
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const fullXhtmlUrl = `${apiUrl}${chapter.xhtmlUrl}`
      
      const xhtmlResponse = await fetch(fullXhtmlUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!xhtmlResponse.ok) throw new Error('Failed to load chapter')

      const html = await xhtmlResponse.text()
      setChapterContent(html)
      
      // Scroll to top when new chapter content is loaded
      setTimeout(() => {
        if (mainRef.current) {
          mainRef.current.scrollTo({
            top: 0,
            behavior: 'smooth',
          })
        }
      }, 100)

      // Helper function to extract sentences from HTML
      // This is a fallback for books imported before sentence processing was implemented
      const extractSentencesFromHtml = (htmlContent: string): Sentence[] => {
        const extracted: Sentence[] = []
        
        try {
          // Try parsing as HTML first
          const parser = new DOMParser()
          const doc = parser.parseFromString(htmlContent, 'text/html')
          
          // Try multiple selectors
          let sentenceSpans = doc.querySelectorAll('span[data-sent][id]')
          
          // If no results, try without data-sent requirement (just id with s- prefix)
          if (sentenceSpans.length === 0) {
            sentenceSpans = doc.querySelectorAll('span[id^="s-"]')
          }
          
          // If still no results, try in body directly
          if (sentenceSpans.length === 0) {
            const body = doc.body || doc.documentElement
            if (body) {
              sentenceSpans = body.querySelectorAll('span[id^="s-"], span[data-sent]')
            }
          }
          
          console.log(`[ExtractSentences] Found ${sentenceSpans.length} potential sentence spans`)
          
          sentenceSpans.forEach((span) => {
            const sentenceIndexAttr = span.getAttribute('data-sent')
            const sentenceIndex = sentenceIndexAttr 
              ? parseInt(sentenceIndexAttr, 10) 
              : (() => {
                  // Try to extract from id like "s-000123"
                  const id = span.getAttribute('id') || ''
                  const match = id.match(/s-(\d+)/)
                  return match ? parseInt(match[1], 10) : -1
                })()
            
            const markerId = span.getAttribute('id') || ''
            const text = span.textContent || span.innerText || ''
            
            if (markerId && text.trim() && sentenceIndex >= 0) {
              extracted.push({
                sentenceIndex,
                text: text.trim(),
                markerId,
              })
            }
          })
          
          // Sort by sentenceIndex
          extracted.sort((a, b) => a.sentenceIndex - b.sentenceIndex)
          
          console.log(`[ExtractSentences] Extracted ${extracted.length} sentences from HTML`)
        } catch (error) {
          console.error('[ExtractSentences] Error extracting sentences:', error)
        }
        
        return extracted
      }
      
      // Store extracted sentences for fallback
      const extractedSentences = extractSentencesFromHtml(html)
      console.log(`[LoadChapter] Extracted ${extractedSentences.length} sentences from HTML as fallback`)

      // Load sentences
      try {
        const sentencesResponse = await apiRequest<SentencesResponse>(
          `/books/${bookId}/chapters/${chapter.id}/sentences`,
        )
        console.log('Sentences loaded:', {
          chapterId: chapter.id,
          count: sentencesResponse.sentences?.length || 0,
          sentences: sentencesResponse.sentences,
        })
        
        if (sentencesResponse.sentences && sentencesResponse.sentences.length > 0) {
          // Verify sentences match HTML content
          console.log(`[LoadChapter] Loaded ${sentencesResponse.sentences.length} sentences from API`)
          console.log(`[LoadChapter] First 3 sentences:`, sentencesResponse.sentences.slice(0, 3).map(s => ({
            index: s.sentenceIndex,
            markerId: s.markerId,
            text: s.text.substring(0, 50)
          })))
          
          setSentences(sentencesResponse.sentences)
          setSentencesError(null)
        } else {
          // Fallback: try to extract from HTML if available
          if (extractedSentences.length > 0) {
            console.log(`[LoadChapter] Using ${extractedSentences.length} sentences extracted from HTML for chapter:`, chapter.id)
            console.log(`[LoadChapter] First 3 extracted sentences:`, extractedSentences.slice(0, 3).map(s => ({
              index: s.sentenceIndex,
              markerId: s.markerId,
              text: s.text.substring(0, 50)
            })))
            setSentences(extractedSentences)
            setSentencesError(null)
          } else {
            console.warn('[LoadChapter] No sentences found for chapter:', chapter.id, {
              extractedCount: extractedSentences.length,
              htmlLength: html.length,
            })
            setSentences([])
            setSentencesError(
              extractedSentences.length > 0
                ? 'No sentences in database, but found in HTML. Please re-process the book.'
                : 'No sentences available. The chapter may not have been processed correctly during import. Please try re-processing the book.'
            )
          }
        }
      } catch (sentencesError: any) {
        console.error('Failed to load sentences:', {
          error: sentencesError,
          message: sentencesError.message,
          statusCode: sentencesError.statusCode,
          chapterId: chapter.id,
          bookId,
        })
        setSentencesError(
          sentencesError.message || 
          `Failed to load sentences: ${sentencesError.statusCode ? `HTTP ${sentencesError.statusCode}` : 'Network error'}`
        )
        setSentences([])
      } finally {
        setLoadingSentences(false)
      }

      // Progress will be loaded by useProgress hook
    } catch (error: any) {
      console.error('Failed to load chapter:', error)
      setSentencesError(error.message || 'Failed to load chapter')
      setLoadingSentences(false)
    }
  }

  const handleReprocessBook = async () => {
    if (!book) return
    
    setReprocessing(true)
    try {
      const result = await apiRequest<{
        bookId: string
        chaptersProcessed: number
        sentencesCreated: number
        errors: string[]
      }>(`/books/${bookId}/reprocess`, {
        method: 'POST',
      })
      
      console.log('Reprocess result:', result)
      
      // Reload current chapter
      await loadChapter(currentChapterIndex)
      
      alert(`Re-processed ${result.chaptersProcessed} chapters, created ${result.sentencesCreated} sentences.`)
    } catch (error: any) {
      console.error('Failed to reprocess book:', error)
      alert(`Failed to reprocess: ${error.message || 'Unknown error'}`)
    } finally {
      setReprocessing(false)
    }
  }

  // Handle sentence click (seek)
  const handleSentenceClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      const span = target.closest('span[data-sent]')
      if (!span) return

      const sentenceIndex = parseInt(span.getAttribute('data-sent') || '0', 10)
      seek(sentenceIndex)
    },
    [seek],
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (isPlaying && !isPaused) {
            pause()
          } else {
            play()
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          prev()
          break
        case 'ArrowRight':
          e.preventDefault()
          next()
          break
        case 'Escape':
          setShowSettings(false)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, isPaused, play, pause, prev, next])

  // Stop TTS when page becomes hidden (user switches tabs, minimizes, etc.)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isPlaying) {
        console.log('[ReaderPage] Page hidden, stopping TTS')
        stop()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isPlaying, stop])

  // Stop TTS when navigating away (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('[ReaderPage] Before unload, stopping TTS')
      stop()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [stop])

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!book) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-gray-500 dark:text-gray-400">Book not found</div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col">
        <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              stop()
              router.push('/bookshelf')
            }}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            ← Back
          </button>
          <h1 className="text-lg font-medium text-gray-900 dark:text-white line-clamp-1">
            {book.title}
          </h1>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            ⚙️
          </button>
        </header>

        {showSettings && (
          <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
            <div className="max-w-2xl mx-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Font Size: {fontSize}px
                </label>
                <input
                  type="range"
                  min="16"
                  max="24"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Theme
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTheme('light')}
                    className={`px-4 py-2 rounded ${
                      theme === 'light'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    ☀️ Light
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`px-4 py-2 rounded ${
                      theme === 'dark'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    🌙 Dark
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <main ref={mainRef} className="flex-1 overflow-y-auto" style={{ paddingBottom: '280px' }}>
          <div
            ref={contentRef}
            className="max-w-3xl mx-auto px-6 py-8 font-serif leading-relaxed cursor-pointer"
            style={{ fontSize: `${fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: chapterContent }}
            onClick={handleSentenceClick}
          />
        </main>

        {/* Fixed Footer Container */}
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-gray-700 z-50 shadow-lg">
          {/* TTS Controls */}
          <TtsControls
            isPlaying={isPlaying}
            isPaused={isPaused}
            rate={rate}
            voices={voices}
            selectedVoice={selectedVoice}
            voicesLoading={voicesLoading}
            currentSentenceIndex={currentSentenceIndex}
            totalSentences={sentences.length}
            onPlay={play}
            onPause={pause}
            onPrev={prev}
            onNext={next}
            onRateChange={setRate}
            onVoiceChange={setSelectedVoice}
          isSupported={isSupported}
          loading={loadingSentences}
          error={sentencesError}
          onReprocess={handleReprocessBook}
          reprocessing={reprocessing}
        />

          {/* Chapter Navigation */}
          <footer className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => {
                  stop()
                  setCurrentChapterIndex(Math.max(0, currentChapterIndex - 1))
                }}
                disabled={currentChapterIndex === 0}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Prev Chapter
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Chapter {currentChapterIndex + 1} / {book.chapters.length}
              </span>
              <button
                onClick={() => {
                  stop()
                  setCurrentChapterIndex(Math.min(book.chapters.length - 1, currentChapterIndex + 1))
                }}
                disabled={currentChapterIndex === book.chapters.length - 1}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next Chapter →
              </button>
            </div>
          </footer>
        </div>
      </div>
    </ProtectedRoute>
  )
}
