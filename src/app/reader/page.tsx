'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Settings } from 'lucide-react'
import { db, BookLocal, V2Chapter, V2Progress, V2ImportStatus, SentenceBookmark } from '@/storage/db'
import { Sentence } from '@/lib/tts/types'
import { useTts } from '@/hooks/useTts'
import { useSentenceHighlight } from '@/hooks/useSentenceHighlight'
import { useChapterLoader } from '@/hooks/useChapterLoader'
import { useReaderSettings } from '@/hooks/useReaderSettings'
import { useFirebaseSync } from '@/hooks/useFirebaseSync'
import { getCurrentUser } from '@/lib/firebaseAuth'
import TtsControls from '@/components/TtsControls'
import ReaderSettings from '@/components/ReaderSettings'
import ChapterNavigation from '@/components/ChapterNavigation'
import SentenceContextMenu from '@/components/SentenceContextMenu'
import HighlightList from '@/components/HighlightList'
import { Button } from '@/components/ui/button'
import { Bookmark } from 'lucide-react'

function ReaderContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const bookFingerprint = searchParams.get('bookId') as string

  // Reader settings with localStorage persistence
  const { fontSize, setFontSize, fontFamily, setFontFamily, theme, setTheme, showSettings, setShowSettings } = useReaderSettings()
  
  // Firebase sync hook
  const { autoPushProgress, autoPushBookmarks, flushProgress } = useFirebaseSync()

  const [book, setBook] = useState<BookLocal | null>(null)
  const [chapters, setChapters] = useState<V2Chapter[]>([])
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reprocessing] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    sentenceIndex: number
    text: string
  } | null>(null)
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [showBookmarks, setShowBookmarks] = useState(false)

  const currentChapter = chapters[currentChapterIndex] || null

  const contentRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef<boolean>(true) // Control auto-scroll behavior
  const prevSentenceIndexRef = useRef<number>(-1) // Track previous sentence index

  // Helper function to scroll to a sentence element
  const scrollToSentence = useCallback((markerId: string) => {
    if (!contentRef.current || !mainRef.current) {
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

      if (targetScrollTop >= 0 && Math.abs(targetScrollTop - mainRef.current.scrollTop) > 10) {
        mainRef.current.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth',
        })
      } else {
        // Fallback to scrollIntoView
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

  // Track pending navigation intent for auto-play
  const [pendingAutoPlay, setPendingAutoPlay] = useState(false)

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
        
        // Save to local DB first, then sync to Firebase
        db.v2Progress.put(updated).then(() => {
          // Auto-push to Firebase if authenticated
          const user = getCurrentUser()
          if (user) {
            autoPushProgress(updated)
          }
        }).catch(err => {
          console.error('Failed to save progress to local DB:', err)
          // Still try to sync to Firebase even if local save fails
          const user = getCurrentUser()
          if (user) {
            autoPushProgress(updated)
          }
        })
      }
    },
    onProgress: () => { },
    onChapterEnd: () => {
      // Flush progress before moving to next chapter
      flushProgress().catch(err => console.warn('Failed to flush progress on chapter end:', err))
      
      // Auto-advance to next chapter when current chapter finishes
      if (currentChapterIndex < chapters.length - 1) {
        const nextIndex = currentChapterIndex + 1
        // Set pending auto-play intent
        setPendingAutoPlay(true)
        setCurrentChapterIndex(nextIndex)
        stop()
        loadChapter(nextIndex)
      }
    },
  })

  // Auto-play after chapter loads when onChapterEnd was triggered
  useEffect(() => {
    // Only auto-play if pending intent is set, chapter is done loading, and sentences are available
    if (pendingAutoPlay && !loadingSentences && sentences.length > 0) {
      // Reset intent first to prevent double-play
      setPendingAutoPlay(false)
      // Use playFrom(0) to explicitly start from beginning of new chapter
      playFrom(0)
    }
  }, [pendingAutoPlay, loadingSentences, sentences.length, playFrom])

  const currentSentence = sentences[currentSentenceIndex] || null
  const currentMarkerId = currentSentence?.markerId || null
  const currentSentenceText = currentSentence?.text || null

  // Only scroll when:
  // 1. Audio is playing
  // 2. Auto-scroll is enabled (not disabled by user click)
  const shouldScroll = isPlaying && shouldAutoScrollRef.current

  // Update previous sentence index
  useEffect(() => {
    if (currentSentenceIndex !== prevSentenceIndexRef.current) {
      prevSentenceIndexRef.current = currentSentenceIndex
    }
  }, [currentSentenceIndex])

  useSentenceHighlight(contentRef, currentMarkerId, currentSentenceText, shouldScroll, mainRef)

  // Note: Highlight is now fully handled by useSentenceHighlight hook
  // No need for separate effect here - it was causing conflicts

  // Apply font settings when contentRef becomes available or content changes
  // Note: localStorage persistence is now handled by useReaderSettings hook
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.style.fontFamily = fontFamily
      contentRef.current.style.fontSize = `${fontSize}px`
    }
  }, [chapterContent, fontFamily, fontSize])

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
      ; (async () => {
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

  // Load bookmarks for current chapter
  useEffect(() => {
    if (!currentChapter) return

    db.sentenceBookmarks
      .where('[bookFingerprint+chapterId]')
      .equals([bookFingerprint, currentChapter.chapterId])
      .toArray()
      .then(items => {
        setBookmarks(new Set(items.map(h => h.sentenceIndex)))
      })
      .catch(err => console.error('Failed to load bookmarks:', err))
  }, [currentChapter, bookFingerprint])

  // Apply bookmark class to HTML
  useEffect(() => {
    if (!contentRef.current || bookmarks.size === 0) return

    const applyBookmarks = () => {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        const container = contentRef.current
        if (!container) return

        let appliedCount = 0
        bookmarks.forEach(sentenceIndex => {
          const span = container.querySelector(`span[data-sent="${sentenceIndex}"]`)
          if (span) {
            if (!span.classList.contains('sentence-bookmarked')) {
              span.classList.add('sentence-bookmarked')
            }
            appliedCount++
          }
        })

        // If we have bookmarks but haven't found all spans yet, retry briefly
        // This helps when dangerouslySetInnerHTML is still processing or hydrating
        /* 
           NOTE: 
           This assumes all bookmarks belong to the current chapter.
           If we have partial validation, we might retry unnecessarily, 
           but usually bookmarks matches current chapter content.
        */
      })
    }

    // Run immediately
    applyBookmarks()

    if (!contentRef.current) return

    const observer = new MutationObserver((mutations) => {
      let nodesAdded = false
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          nodesAdded = true
          break
        }
      }
      if (nodesAdded) applyBookmarks()
    })

    observer.observe(contentRef.current, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
    }
  }, [bookmarks, chapterContent])

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

  // Helper to find the deepest span[data-sent] from a target element
  // This ensures we get the actual sentence span being clicked, not a parent container
  const findSentenceSpan = useCallback((target: HTMLElement): HTMLElement | null => {
    // Strategy: Find the span[data-sent] that contains the target and has no child span[data-sent] that also contains the target
    // This gives us the "innermost" or "deepest" sentence span

    // Walk up from target to find all spans with data-sent
    let current: HTMLElement | null = target
    const candidateSpans: HTMLElement[] = []

    while (current && current !== contentRef.current) {
      if (current.tagName === 'SPAN' && current.hasAttribute('data-sent')) {
        candidateSpans.push(current)
      }
      current = current.parentElement
    }

    if (candidateSpans.length === 0) {
      // No parent span found, check if target or its children have spans
      if (target.tagName === 'SPAN' && target.hasAttribute('data-sent')) {
        candidateSpans.push(target)
      } else {
        const childSpan = target.querySelector('span[data-sent]')
        if (childSpan) {
          candidateSpans.push(childSpan as HTMLElement)
        }
      }
    }

    if (candidateSpans.length === 0) return null

    // Find the span that contains target and has no child span[data-sent] that also contains target
    // The first span in the array (closest to target) is the deepest one
    for (const span of candidateSpans) {
      // Check if this span has a child span[data-sent] that also contains the target
      const childSpans = span.querySelectorAll('span[data-sent]')
      let hasContainingChild = false
      // Convert NodeList to Array for compatibility with es5 target
      const childSpansArray = Array.from(childSpans)
      for (const childSpan of childSpansArray) {
        if ((childSpan as HTMLElement).contains(target)) {
          hasContainingChild = true
          break
        }
      }
      // If no containing child, this is the deepest span
      if (!hasContainingChild) {
        return span
      }
    }

    // Fallback: return the first candidate (closest to target)
    return candidateSpans[0]
  }, [contentRef])

  // Touch event handling for long press on mobile
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const span = findSentenceSpan(target)
    if (!span) return

    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }

    // Set a timer for long press (500ms)
    touchTimerRef.current = setTimeout(() => {
      const sentenceIndex = parseInt(span.getAttribute('data-sent') || '0', 10)
      const text = span.textContent || ''

      // Stop TTS if playing, then set sentence index without auto-playing
      // User can choose to play from here via context menu option
      // Note: No auto-scroll here - scroll only happens when TTS is playing
      stop()
      setSentenceIndex(sentenceIndex)

      // Show context menu at touch position
      setContextMenu({
        x: touch.clientX,
        y: touch.clientY,
        sentenceIndex,
        text,
      })
    }, 500)
  }, [stop, setSentenceIndex, findSentenceSpan, sentences])

  const handleTouchEnd = useCallback(() => {
    // Clear the long press timer if touch ends before 500ms
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
    }
    touchStartPosRef.current = null
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    // Cancel long press if user moves finger too much
    if (touchStartPosRef.current && touchTimerRef.current) {
      const touch = e.touches[0]
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x)
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y)

      // If moved more than 10px, cancel the long press
      if (deltaX > 10 || deltaY > 10) {
        clearTimeout(touchTimerRef.current)
        touchTimerRef.current = null
      }
    }
  }, [])

  const handleSentenceContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      const target = e.target as HTMLElement
      const span = findSentenceSpan(target)
      if (!span) return

      const sentenceIndex = parseInt(span.getAttribute('data-sent') || '0', 10)
      const text = span.textContent || ''

      // Stop TTS if playing, then set sentence index without auto-playing
      // User can choose to play from here via context menu option
      // Note: No auto-scroll here - scroll only happens when TTS is playing
      stop()
      setSentenceIndex(sentenceIndex)

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        sentenceIndex,
        text,
      })
    },
    [stop, setSentenceIndex, findSentenceSpan, sentences],
  )

  const handleReadFromHere = useCallback(() => {
    if (contextMenu && currentChapter) {
      const targetIndex = contextMenu.sentenceIndex
      // Set index first, then call play() - exactly like clicking play button
      setSentenceIndex(targetIndex)
      play()
    }
  }, [contextMenu, currentChapter, setSentenceIndex, play])

  const handleBookmarkSentence = useCallback(async () => {
    if (!contextMenu || !currentChapter) return

    // Check if bookmark already exists
    const existing = await db.sentenceBookmarks
      .where('[bookFingerprint+chapterId]')
      .equals([bookFingerprint, currentChapter.chapterId])
      .filter(h => h.sentenceIndex === contextMenu.sentenceIndex)
      .first()

    if (existing) {
      // If exists, remove it (Unbookmark)
      if (existing.id) {
        await db.sentenceBookmarks.delete(existing.id)

        // Remove from local state
        setBookmarks((prev) => {
          const next = new Set(prev)
          next.delete(contextMenu.sentenceIndex)
          return next
        })

        // Remove class from DOM immediately
        const span = contentRef.current?.querySelector(`span[data-sent="${contextMenu.sentenceIndex}"]`)
        if (span) {
          span.classList.remove('sentence-bookmarked')
        }

        // Auto-push to Firebase if authenticated
        const user = getCurrentUser()
        if (user) {
          const allBookmarks = await db.sentenceBookmarks
            .where('[bookFingerprint+chapterId]')
            .equals([bookFingerprint, currentChapter.chapterId])
            .toArray()
          autoPushBookmarks(bookFingerprint, allBookmarks)
        }
      }
      setContextMenu(null)
      return
    }

    const bookmark: Omit<SentenceBookmark, 'id'> = {
      bookFingerprint,
      chapterId: currentChapter.chapterId,
      sentenceIndex: contextMenu.sentenceIndex,
      markerId: sentences[contextMenu.sentenceIndex]?.markerId || '',
      text: contextMenu.text,
      createdAtMs: Date.now(),
    }

    await db.sentenceBookmarks.add(bookmark)
    // Reload bookmarks for this chapter
    setBookmarks((prev) => new Set(prev).add(contextMenu.sentenceIndex))
    
    // Auto-push to Firebase if authenticated
    const user = getCurrentUser()
    if (user) {
      const allBookmarks = await db.sentenceBookmarks
        .where('[bookFingerprint+chapterId]')
        .equals([bookFingerprint, currentChapter.chapterId])
        .toArray()
      autoPushBookmarks(bookFingerprint, allBookmarks)
    }
    
    setContextMenu(null)
  }, [contextMenu, currentChapter, bookFingerprint, sentences, autoPushBookmarks])

  const handleNavigateToBookmark = useCallback((chapterId: string, sentenceIndex: number) => {
    // Check if we are already in the correct chapter
    const targetChapterIndex = chapters.findIndex(c => c.chapterId === chapterId)
    if (targetChapterIndex === -1) return

    if (currentChapterIndex !== targetChapterIndex) {
      // Need to switch chapter first
      // We'll set a temporary "restore point" that will be picked up after chapter load

      /* 
         We can simulate a Progress update and let the existing restoration logic handle it.
         Or update state and call loadChapter.
      */

      const targetProgress: V2Progress = {
        bookFingerprint,
        chapterId,
        sentenceIndex,
        markerId: '', // Will be resolved after load
        updatedAtMs: Date.now()
      }

      // Update local progress/state so the restoration logic picks it up
      setProgress(targetProgress)
      hasRestoredPositionRef.current = false // Allow restoration to happen again
      setCurrentChapterIndex(targetChapterIndex)
      loadChapter(targetChapterIndex)
    } else {
      // Same chapter - just jump there
      setSentenceIndex(sentenceIndex)
      seek(sentenceIndex) // Also updates TTS if playing

      // Scroll to it
      setTimeout(() => {
        // Find DOM element
        // useSentenceHighlight will handle the scrolling if we update useTts state (which seek/setSentenceIndex does)
        // But let's force scroll just in case
        const targetSentence = sentences[sentenceIndex]
        if (targetSentence) {
          const element = document.getElementById(targetSentence.markerId)
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }, [chapters, currentChapterIndex, bookFingerprint, loadChapter, setSentenceIndex, seek, sentences])

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
    const handleBeforeUnload = () => {
      stop()
      // Flush pending progress sync before page unload
      flushProgress().catch(err => console.warn('Failed to flush progress on unload:', err))
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Flush pending progress sync on unmount
      flushProgress().catch(err => console.warn('Failed to flush progress on unmount:', err))
    }
  }, [stop, flushProgress])

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

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowBookmarks(true)}
            className="h-9 w-9"
            title="View Bookmarks"
          >
            <Bookmark className="h-5 w-5 stroke-[2]" />
          </Button>

          <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)} className="h-9 w-9">
            <Settings className="h-5 w-5 stroke-[2]" />
          </Button>
        </div>

        {showSettings && (
          <ReaderSettings
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            fontFamily={fontFamily}
            onFontFamilyChange={setFontFamily}
            theme={theme}
            onThemeChange={setTheme}
          />
        )}
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto" style={{ paddingBottom: '100px' }}>
        <div
          ref={contentRef}
          className="max-w-3xl mx-auto px-6 py-12 leading-relaxed cursor-pointer"
          style={{ fontSize: `${fontSize}px`, fontFamily: fontFamily }}
          dangerouslySetInnerHTML={{ __html: chapterContent }}
          onContextMenu={handleSentenceContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
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
          totalChapters={chapters.length}
          onPlay={play}
          onPause={pause}
          onPrev={prev}
          onNext={next}
          onPrevChapter={() => {
            stop()
            const newIndex = Math.max(0, currentChapterIndex - 1)
            handleLoadChapter(newIndex)
          }}
          onNextChapter={() => {
            stop()
            const newIndex = Math.min(chapters.length - 1, currentChapterIndex + 1)
            handleLoadChapter(newIndex)
          }}
          onRateChange={setRate}
          onVoiceChange={setSelectedVoice}
          isSupported={isSupported}
          loading={loadingSentences}
          error={sentencesError}
          onReprocess={() => { }}
          reprocessing={reprocessing}
        />
      </div>

      {contextMenu && (
        <SentenceContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          sentenceText={contextMenu.text}
          onReadFromHere={handleReadFromHere}
          onHighlight={handleBookmarkSentence}
          isHighlighted={bookmarks.has(contextMenu.sentenceIndex)}
          onClose={() => setContextMenu(null)}
        />
      )}

      <HighlightList
        bookFingerprint={bookFingerprint}
        chapters={chapters}
        isOpen={showBookmarks}
        onClose={() => setShowBookmarks(false)}
        onNavigate={handleNavigateToBookmark}
      />
    </div>
  )
}

export default function ReaderPageV2() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ReaderContent />
    </Suspense>
  )
}
