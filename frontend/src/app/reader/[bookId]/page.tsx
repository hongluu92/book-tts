'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Settings } from 'lucide-react'
import { db, BookLocal, V2Chapter, V2Progress, V2ImportStatus } from '@/storage/db'
import { Sentence } from '@/lib/tts/types'
import { useTts } from '@/hooks/useTts'
import { useSentenceHighlight } from '@/hooks/useSentenceHighlight'
import { useChapterLoader } from '@/hooks/useChapterLoader'
import TtsControls from '@/components/TtsControls'
import ReaderSettings from '@/components/ReaderSettings'
import ChapterNavigation from '@/components/ChapterNavigation'
import { Button } from '@/components/ui/button'

export default function ReaderPageV2() {
  const params = useParams()
  const router = useRouter()
  const bookFingerprint = params.bookId as string

  const [book, setBook] = useState<BookLocal | null>(null)
  const [chapters, setChapters] = useState<V2Chapter[]>([])
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fontSize, setFontSize] = useState(18)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [showSettings, setShowSettings] = useState(false)
  const [reprocessing] = useState(false)

  const currentChapter = chapters[currentChapterIndex] || null

  const contentRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  // Helper function to scroll to a sentence element
  const scrollToSentence = useCallback((markerId: string) => {
    if (!contentRef.current || !mainRef.current) {
      console.log('[Reader] Cannot scroll - refs not ready')
      return
    }

    const element = contentRef.current.querySelector(`#${markerId}`) as HTMLElement
    const targetElement = element || (() => {
      const sentenceIndex = markerId.match(/s-(\d+)/)?.[1]
      if (sentenceIndex) {
        return contentRef.current?.querySelector(`span[data-sent="${sentenceIndex}"]`) as HTMLElement
      }
      return null
    })()

    if (!targetElement) {
      console.log('[Reader] Element not found for markerId:', markerId)
      return
    }

    if (mainRef.current) {
      // Use offsetTop for more reliable calculation
      const elementOffsetTop = targetElement.offsetTop
      const containerOffsetTop = mainRef.current.offsetTop || 0
      const containerHeight = mainRef.current.clientHeight
      const elementHeight = targetElement.offsetHeight
      
      // Calculate target scroll to center element
      const targetScrollTop = elementOffsetTop - containerOffsetTop - (containerHeight / 2) + (elementHeight / 2)
      
      console.log('[Reader] Scroll debug:', {
        markerId,
        elementOffsetTop,
        containerOffsetTop,
        containerHeight,
        elementHeight,
        targetScrollTop,
        currentScrollTop: mainRef.current.scrollTop,
      })
      
      if (targetScrollTop >= 0 && Math.abs(targetScrollTop - mainRef.current.scrollTop) > 10) {
        mainRef.current.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth',
        })
        console.log('[Reader] Scrolled to sentence:', markerId, 'scrollTop:', targetScrollTop)
      } else {
        // Fallback to scrollIntoView
        console.log('[Reader] Using scrollIntoView fallback')
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        })
      }
    }
  }, [])

  const [progress, setProgress] = useState<V2Progress | null>(null)
  const [importStatus, setImportStatus] = useState<V2ImportStatus | null>(null)

  const loadInitial = useCallback(async () => {
    try {
      const [b, chaps, status] = await Promise.all([
        db.books.get(bookFingerprint),
        db.v2Chapters.where('bookFingerprint').equals(bookFingerprint).sortBy('spineIndex'),
        db.v2ImportStatus.get(bookFingerprint),
      ])
      setBook(b || null)
      setChapters(chaps)
      setImportStatus(status || null)
    } finally {
      setLoading(false)
    }
  }, [bookFingerprint])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  // Poll import status + chapters while content is still being parsed in background
  useEffect(() => {
    if (!bookFingerprint) return
    if (chapters.length > 0) return

    let cancelled = false

    const tick = async () => {
      try {
        const status = await db.v2ImportStatus.get(bookFingerprint)
        if (cancelled) return
        setImportStatus(status || null)

        if (status && status.parsedChapters > 0) {
          const chaps = await db.v2Chapters
            .where('bookFingerprint')
            .equals(bookFingerprint)
            .sortBy('spineIndex')
          if (!cancelled && chaps.length > 0) {
            setChapters(chaps)
          }
        }
      } catch (e) {
        // best-effort, ignore
        console.warn('[v2 Reader] Failed to poll import status', e)
      }
    }

    const interval = setInterval(tick, 1000)
    // run immediately once
    tick()

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [bookFingerprint, chapters.length])

  // Use ref to store stop function to avoid circular dependency
  const stopRef = useRef<(() => void) | null>(null)

  const {
    loadChapter,
    hasRestoredPositionRef,
    loadingSentences,
    sentences,
    chapterContent,
    sentencesError,
    setSentences,
  } = useChapterLoader({
    chapters,
    bookFingerprint,
    onStop: () => stopRef.current?.(),
    scrollContainerRef: mainRef,
  })

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
    setSentenceIndex,
    prev,
    next,
    isSupported,
  } = useTts({
    sentences,
    onSentenceStart: (sentence) => {
      if (currentChapter) {
        const updated: V2Progress = {
          bookFingerprint,
          chapterId: currentChapter.chapterId,
          sentenceIndex: sentence.sentenceIndex,
          markerId: sentence.markerId,
          ttsVoice: selectedVoice?.name,
          ttsRate: rate,
          updatedAtMs: Date.now(),
        }
        setProgress(updated)
        db.v2Progress.put(updated)
      }
    },
    onProgress: () => {},
  })

  // Update stop ref after useTts is initialized
  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  const currentMarkerId = sentences[currentSentenceIndex]?.markerId || null
  // Always highlight the current sentence, not just when playing
  // This ensures the highlight is visible when TTS starts or when user seeks
  useSentenceHighlight(contentRef, currentMarkerId, true, mainRef)

  // Force re-highlight and scroll when chapterContent changes (new chapter loaded)
  // This ensures highlight is applied after HTML is rendered
  useEffect(() => {
    if (currentMarkerId && contentRef.current && chapterContent) {
      // Small delay to ensure React has finished rendering the HTML
      const timer = setTimeout(() => {
        const findAndHighlight = () => {
          let element = contentRef.current?.querySelector(`#${currentMarkerId}`) as HTMLElement
          if (!element) {
            // Try data-sent as fallback
            const sentenceIndex = currentMarkerId.match(/s-(\d+)/)?.[1]
            if (sentenceIndex) {
              element = contentRef.current?.querySelector(`span[data-sent="${sentenceIndex}"]`) as HTMLElement
            }
          }
          
          if (element) {
            // Remove all previous highlights
            contentRef.current?.querySelectorAll('.tts-active').forEach((el) => el.classList.remove('tts-active'))
            element.classList.add('tts-active')
            
            // Scroll to element
            scrollToSentence(currentMarkerId)
          }
        }
        
        findAndHighlight()
        // Retry after a longer delay in case DOM wasn't ready
        setTimeout(findAndHighlight, 300)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [chapterContent, currentMarkerId])

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
  }, [])

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

  const handleLoadChapter = useCallback(
    (index: number) => {
      loadChapter(index)
      setCurrentChapterIndex(index)
    },
    [loadChapter],
  )

  // Tìm và khôi phục chương đã đọc lần cuối (giống v1)
  useEffect(() => {
    if (!chapters.length) return
    hasRestoredPositionRef.current = false // Reset flag khi chapters thay đổi
    ;(async () => {
      try {
        // Lấy tất cả progress của sách, sắp xếp theo thời gian giảm dần để lấy progress mới nhất
        const allProgress = await db.v2Progress.where('bookFingerprint').equals(bookFingerprint).toArray()
        if (allProgress.length > 0) {
          const lastProgress = allProgress.sort((a, b) => {
            const dateA = a.updatedAtMs || 0
            const dateB = b.updatedAtMs || 0
            return dateB - dateA
          })[0]

          setProgress(lastProgress)
          const idx = chapters.findIndex((ch) => ch.chapterId === lastProgress.chapterId)
          const chapterIndex = idx >= 0 ? idx : 0
          setCurrentChapterIndex(chapterIndex)
          handleLoadChapter(chapterIndex)
        } else {
          handleLoadChapter(0)
        }
      } catch (error) {
        console.error('Failed to find last read chapter:', error)
        handleLoadChapter(0)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters.length, bookFingerprint])

  // Khôi phục voice và rate đã lưu (sau khi voices đã load)
  useEffect(() => {
    if (!progress || voicesLoading || voices.length === 0) return
    if (progress.ttsVoice) {
      const voice = voices.find((v) => v.name === progress.ttsVoice)
      if (voice) {
        setSelectedVoice(voice)
      }
    }
    if (progress.ttsRate !== undefined) {
      setRate(progress.ttsRate)
    }
  }, [progress, voices, voicesLoading, setSelectedVoice, setRate])

  // Khôi phục vị trí câu sau khi sentences được load và progress có sẵn
  // Chờ useTts hook reset xong rồi mới khôi phục
  useEffect(() => {
    if (!progress || sentences.length === 0 || !currentChapter) return
    if (hasRestoredPositionRef.current) return // Đã khôi phục rồi, không làm lại

    // Chỉ khôi phục nếu progress thuộc về chapter hiện tại
    if (progress.chapterId === currentChapter.chapterId && progress.sentenceIndex >= 0) {
      // Kiểm tra sentenceIndex hợp lệ
      if (progress.sentenceIndex >= sentences.length) {
        console.warn('[v2 Reader] Saved sentenceIndex out of bounds:', {
          saved: progress.sentenceIndex,
          total: sentences.length,
        })
        hasRestoredPositionRef.current = true // Đánh dấu đã xử lý để không thử lại
        return
      }

      // Đợi useTts hook reset xong (thường reset về 0 khi sentences thay đổi)
      // Đợi đủ lâu để đảm bảo useTts đã reset và DOM đã render
      const timer = setTimeout(() => {
        if (!hasRestoredPositionRef.current && progress.sentenceIndex < sentences.length && progress.sentenceIndex >= 0) {
          const targetSentence = sentences[progress.sentenceIndex]
          if (!targetSentence) {
            console.warn('[v2 Reader] Target sentence not found:', progress.sentenceIndex)
            hasRestoredPositionRef.current = true
            return
          }

          // Chỉ set vị trí mà không play (tránh tự động play khi chuyển chương)
          // Nếu người dùng đang play, họ sẽ bấm play lại và sẽ đọc từ vị trí này
          setSentenceIndex(progress.sentenceIndex)

          // Scroll đến vị trí đó trong DOM
          setTimeout(() => {
            const markerElement = document.getElementById(targetSentence.markerId)
            if (markerElement && mainRef.current) {
              markerElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }, 100)

          hasRestoredPositionRef.current = true
        }
      }, 600) // Tăng thời gian đợi để đảm bảo useTts đã reset xong

      return () => clearTimeout(timer)
    }
  }, [progress, sentences.length, currentChapter, seek, currentSentenceIndex, setSentenceIndex])

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-gray-500 dark:text-gray-400">Loading…</div>
      </div>
    )
  }

  if (!book || !chapters.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <button
          onClick={() => router.push('/bookshelf')}
          className="mb-4 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
        >
          <ArrowLeft className="h-4 w-4 stroke-[2]" />
          Back to bookshelf
        </button>
        <div className="text-gray-500 dark:text-gray-400 text-center space-y-2">
          {importStatus && importStatus.totalChapters > 0 ? (
            <>
              <div>Đang xử lý nội dung sách…</div>
              <div className="text-sm">
                Đã xử lý {importStatus.parsedChapters}/{importStatus.totalChapters} chương
              </div>
              {importStatus.lastError && (
                <div className="text-xs text-red-500 mt-1 break-words">
                  Lỗi gần nhất: {importStatus.lastError}
                </div>
              )}
            </>
          ) : (
            <>
              <div>Đang chuẩn bị nội dung sách…</div>
              {importStatus?.lastError && (
                <div className="text-xs text-red-500 mt-1 break-words">
                  Lỗi gần nhất: {importStatus.lastError}
                </div>
              )}
            </>
          )}
          <button
            onClick={() => {
              // Thử reload lại danh sách chương và trạng thái
              loadInitial()
            }}
            className="mt-2 inline-flex items-center px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700"
          >
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center gap-4 px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              stop()
              router.push('/bookshelf')
            }}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5 stroke-[2]" />
          </Button>

          <h1 className="flex-1 text-lg font-semibold text-foreground line-clamp-1">{book.title}</h1>

          <ChapterNavigation
            chapters={chapters}
            currentChapterIndex={currentChapterIndex}
            onChapterChange={handleLoadChapter}
            onStop={stop}
          />

          <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)} className="h-9 w-9">
            <Settings className="h-5 w-5 stroke-[2]" />
          </Button>
        </div>

        {showSettings && (
          <ReaderSettings
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            theme={theme}
            onThemeChange={setTheme}
          />
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
          onPlay={play}
          onPause={pause}
          onPrev={prev}
          onNext={next}
          onRateChange={setRate}
          onVoiceChange={setSelectedVoice}
          isSupported={isSupported}
          loading={loadingSentences}
          error={sentencesError}
          onReprocess={() => {}}
          reprocessing={reprocessing}
        />
      </div>
    </div>
  )
}
