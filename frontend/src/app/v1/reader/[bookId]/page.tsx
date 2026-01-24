'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Settings, ChevronLeft, ChevronRight, ChevronDown, Sun, Moon, Search } from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import TtsControls from '@/components/TtsControls'
import { Button, buttonVariants } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { apiRequest } from '@/lib/api'
import { useTts } from '@/hooks/useTts'
import { useSentenceHighlight } from '@/hooks/useSentenceHighlight'
import { useProgress } from '@/hooks/useProgress'
import { useProgressSync } from '@/hooks/useProgressSync'
import { Sentence } from '@/lib/tts/types'
import { db } from '@/storage/db'
import { cn } from '@/lib/utils'

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

export default function ReaderPageV1() {
  const params = useParams()
  const router = useRouter()
  const bookId = params.bookId as string

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
  const [chapterSearchOpen, setChapterSearchOpen] = useState(false)
  const [chapterSearchQuery, setChapterSearchQuery] = useState('')

  const currentChapter = book?.chapters[currentChapterIndex]
  const { progress, saveProgress } = useProgress(bookId, currentChapter?.id || '')
  const { syncProgress } = useProgressSync(bookId)

  const filteredChapters = useMemo(() => {
    if (!book) return []
    if (!chapterSearchQuery.trim()) return book.chapters
    const query = chapterSearchQuery.toLowerCase()
    return book.chapters.filter((chapter, index) => {
      const chapterNum = `chương ${index + 1}`.toLowerCase()
      const title = chapter.title?.toLowerCase().trim() || ''
      return chapterNum.includes(query) || title.includes(query)
    })
  }, [book, chapterSearchQuery])

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
    playFrom,
    prev,
    next,
    isSupported,
  } = useTts({
    sentences,
    onSentenceStart: (sentence) => {
      if (currentChapter) {
        saveProgress({
          bookId,
          chapterId: currentChapter.id,
          sentenceIndex: sentence.sentenceIndex,
          markerId: sentence.markerId,
          ttsVoice: selectedVoice?.name,
          ttsRate: rate,
        })

        syncProgress({
          chapterId: currentChapter.id,
          sentenceIndex: sentence.sentenceIndex,
          markerId: sentence.markerId,
          ttsVoice: selectedVoice?.name,
          ttsRate: rate,
        })
      }
    },
    onProgress: () => {},
  })

  const contentRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const currentMarkerId = sentences[currentSentenceIndex]?.markerId || null

  useSentenceHighlight(contentRef, currentMarkerId, isPlaying && !isPaused, mainRef)

  useEffect(() => {
    const savedTheme = localStorage.getItem('reader-theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    }

    const savedFontSize = localStorage.getItem('reader-font-size')
    if (savedFontSize) {
      setFontSize(parseInt(savedFontSize, 10))
    }

    loadBook()

    return () => {
      stop()
      isMountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, stop])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      if (isMountedRef.current) {
        stop()
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          speechSynthesis.cancel()
        }
      }
    }
  }, [stop])

  const findLastReadChapter = useCallback(async () => {
    if (!book || book.chapters.length === 0) return null
    try {
      const allProgress = await db.progress.where('bookId').equals(bookId).toArray()
      if (allProgress.length === 0) return null
      const lastProgress = allProgress.sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return dateB - dateA
      })[0]
      const chapterIndex = book.chapters.findIndex((ch) => ch.id === lastProgress.chapterId)
      return chapterIndex >= 0 ? chapterIndex : null
    } catch (error) {
      console.error('Failed to find last read chapter:', error)
      return null
    }
  }, [book, bookId, bookId])

  useEffect(() => {
    if (book && book.chapters.length > 0) {
      if (currentChapterIndex === 0) {
        findLastReadChapter().then((lastChapterIndex) => {
          if (lastChapterIndex !== null && lastChapterIndex !== 0) {
            setCurrentChapterIndex(lastChapterIndex)
          } else {
            loadChapter(currentChapterIndex)
          }
        })
      } else {
        loadChapter(currentChapterIndex)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, currentChapterIndex, findLastReadChapter])

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
      stop()
      setSentences([])
      setSentencesError(null)
      setLoadingSentences(true)

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

      setTimeout(() => {
        if (mainRef.current) {
          mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
        }
      }, 100)

      const extractSentencesFromHtml = (htmlContent: string): Sentence[] => {
        const extracted: Sentence[] = []
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(htmlContent, 'text/html')
          let sentenceSpans = doc.querySelectorAll('span[data-sent][id]')
          if (sentenceSpans.length === 0) {
            sentenceSpans = doc.querySelectorAll('span[id^="s-"]')
          }
          if (sentenceSpans.length === 0) {
            const body = doc.body || doc.documentElement
            if (body) {
              sentenceSpans = body.querySelectorAll('span[id^="s-"], span[data-sent]')
            }
          }

          sentenceSpans.forEach((span) => {
            const sentenceIndexAttr = span.getAttribute('data-sent')
            const sentenceIndex = sentenceIndexAttr
              ? parseInt(sentenceIndexAttr, 10)
              : (() => {
                  const id = span.getAttribute('id') || ''
                  const match = id.match(/s-(\\d+)/)
                  return match ? parseInt(match[1], 10) : -1
                })()

            const markerId = span.getAttribute('id') || ''
            const text = span.textContent || (span as HTMLElement).innerText || ''
            if (markerId && text.trim() && sentenceIndex >= 0) {
              extracted.push({ sentenceIndex, text: text.trim(), markerId })
            }
          })
          extracted.sort((a, b) => a.sentenceIndex - b.sentenceIndex)
        } catch (error) {
          console.error('[ExtractSentences] Error extracting sentences:', error)
        }
        return extracted
      }

      const extractedSentences = extractSentencesFromHtml(html)

      try {
        const sentencesResponse = await apiRequest<SentencesResponse>(`/books/${bookId}/chapters/${chapter.id}/sentences`)
        if (sentencesResponse.sentences && sentencesResponse.sentences.length > 0) {
          setSentences(sentencesResponse.sentences)
          setSentencesError(null)
        } else if (extractedSentences.length > 0) {
          setSentences(extractedSentences)
          setSentencesError(null)
        } else {
          setSentences([])
          setSentencesError('No sentences available. Please try re-processing the book.')
        }
      } catch (sentencesError: any) {
        setSentencesError(sentencesError.message || 'Failed to load sentences')
        setSentences([])
      } finally {
        setLoadingSentences(false)
      }
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
      await apiRequest(`/books/${bookId}/reprocess`, { method: 'POST' })
      await loadChapter(currentChapterIndex)
    } catch (error: any) {
      alert(`Failed to reprocess: ${error.message || 'Unknown error'}`)
    } finally {
      setReprocessing(false)
    }
  }

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

  const handleSentenceDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      const target = e.target as HTMLElement
      const span = target.closest('span[data-sent]')
      if (!span) return
      const sentenceIndex = parseInt(span.getAttribute('data-sent') || '0', 10)
      playFrom(sentenceIndex)
    },
    [playFrom],
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return
      }
      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (isPlaying && !isPaused) pause()
          else play()
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

  // NOTE: Do NOT auto-stop TTS when the tab is hidden.
  // Users may want audio to continue while switching tabs.

  useEffect(() => {
    const handleBeforeUnload = () => stop()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
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
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center gap-4 px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                stop()
                router.push('/v1/bookshelf')
              }}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5 stroke-[2]" />
            </Button>

            <h1 className="flex-1 text-lg font-semibold text-foreground line-clamp-1">{book.title}</h1>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  stop()
                  const newIndex = Math.max(0, currentChapterIndex - 1)
                  setCurrentChapterIndex(newIndex)
                }}
                disabled={currentChapterIndex === 0}
                className="h-9 w-9"
              >
                <ChevronLeft className="h-4 w-4 stroke-[2]" />
              </Button>

              <DropdownMenu
                open={chapterSearchOpen}
                onOpenChange={(open) => {
                  setChapterSearchOpen(open)
                  if (!open) setChapterSearchQuery('')
                }}
              >
              <DropdownMenuTrigger
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-w-[140px] justify-between gap-2')}
              >
                    <span className="text-sm truncate">
                      Chương {currentChapterIndex + 1} / {book.chapters.length}
                    </span>
                    <ChevronDown className="h-4 w-4 stroke-[2] opacity-50 flex-shrink-0" />
                </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" className="w-[320px] p-0 max-h-[60vh]">
                  <div className="p-2 border-b sticky top-0 bg-background z-10" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Tìm kiếm chương..."
                        value={chapterSearchQuery}
                        onChange={(e) => setChapterSearchQuery(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-[calc(60vh-60px)]">
                    {filteredChapters.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-muted-foreground text-center">Không tìm thấy chương</div>
                    ) : (
                      filteredChapters.map((chapter) => {
                        const index = book.chapters.findIndex((ch) => ch.id === chapter.id)
                        return (
                          <DropdownMenuItem
                            key={chapter.id}
                            onSelect={() => {
                              stop()
                              setCurrentChapterIndex(index)
                              setChapterSearchOpen(false)
                              setChapterSearchQuery('')
                            }}
                            className={cn('cursor-pointer px-3 py-2', index === currentChapterIndex && 'bg-accent')}
                          >
                            <div className="flex flex-col gap-0.5 w-full min-w-0">
                              <span className="font-medium text-sm truncate">Chương {index + 1}</span>
                              {chapter.title && (
                                <span className="text-xs text-muted-foreground line-clamp-1 truncate">{chapter.title.trim()}</span>
                              )}
                            </div>
                          </DropdownMenuItem>
                        )
                      })
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  stop()
                  const newIndex = Math.min(book.chapters.length - 1, currentChapterIndex + 1)
                  setCurrentChapterIndex(newIndex)
                }}
                disabled={currentChapterIndex === book.chapters.length - 1}
                className="h-9 w-9"
              >
                <ChevronRight className="h-4 w-4 stroke-[2]" />
              </Button>
            </div>

            <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)} className="h-9 w-9">
              <Settings className="h-5 w-5 stroke-[2]" />
            </Button>
          </div>

          {showSettings && (
            <div className="border-t bg-background px-4 py-4">
              <div className="container max-w-2xl mx-auto space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Cỡ chữ: {fontSize}px</label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">16</span>
                    <Slider
                      min={16}
                      max={24}
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground">24</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Giao diện</label>
                  <div className="flex gap-2">
                    <Button
                      variant={theme === 'light' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTheme('light')}
                      className="flex items-center gap-2"
                    >
                      <Sun className="h-4 w-4 stroke-[2]" />
                      Sáng
                    </Button>
                    <Button
                      variant={theme === 'dark' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTheme('dark')}
                      className="flex items-center gap-2"
                    >
                      <Moon className="h-4 w-4 stroke-[2]" />
                      Tối
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </header>

        <main ref={mainRef} className="flex-1 overflow-y-auto" style={{ paddingBottom: '100px' }}>
          <div
            ref={contentRef}
            className="max-w-3xl mx-auto px-6 py-12 font-serif leading-relaxed cursor-pointer"
            style={{ fontSize: `${fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: chapterContent }}
            onClick={handleSentenceClick}
            onDoubleClick={handleSentenceDoubleClick}
          />
        </main>

        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-lg">
          <TtsControls
            isPlaying={isPlaying}
            isPaused={isPaused}
            rate={rate}
            voices={voices}
            selectedVoice={selectedVoice}
            voicesLoading={voicesLoading}
            currentSentenceIndex={currentSentenceIndex}
            totalSentences={sentences.length}
            currentChapterIndex={currentChapterIndex}
            totalChapters={book?.chapters.length || 0}
            onPlay={play}
            onPause={pause}
            onPrev={prev}
            onNext={next}
            onPrevChapter={() => {
              stop()
              const newIndex = Math.max(0, currentChapterIndex - 1)
              setCurrentChapterIndex(newIndex)
              loadChapter(newIndex)
            }}
            onNextChapter={() => {
              stop()
              const newIndex = Math.min(book?.chapters.length - 1 || 0, currentChapterIndex + 1)
              setCurrentChapterIndex(newIndex)
              loadChapter(newIndex)
            }}
            onRateChange={setRate}
            onVoiceChange={setSelectedVoice}
            isSupported={isSupported}
            loading={loadingSentences}
            error={sentencesError}
            onReprocess={handleReprocessBook}
            reprocessing={reprocessing}
          />
        </div>
      </div>
    </ProtectedRoute>
  )
}

