'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Moon, Search, Settings, Sun } from 'lucide-react'
import { db, BookLocal, V2Chapter, V2Progress, V2ImportStatus, BookFile } from '@/storage/db'
import { Sentence } from '@/lib/tts/types'
import { useTts } from '@/hooks/useTts'
import { useSentenceHighlight } from '@/hooks/useSentenceHighlight'
import TtsControls from '@/components/TtsControls'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

export default function ReaderPageV2() {
  const params = useParams()
  const router = useRouter()
  const bookFingerprint = params.bookId as string

  const [book, setBook] = useState<BookLocal | null>(null)
  const [chapters, setChapters] = useState<V2Chapter[]>([])
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [chapterContent, setChapterContent] = useState<string>('')
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingSentences, setLoadingSentences] = useState(false)
  const [sentencesError, setSentencesError] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState(18)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [showSettings, setShowSettings] = useState(false)
  const [chapterSearchOpen, setChapterSearchOpen] = useState(false)
  const [chapterSearchQuery, setChapterSearchQuery] = useState('')
  const [reprocessing] = useState(false)

  const currentChapter = chapters[currentChapterIndex] || null

  const contentRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  const [progress, setProgress] = useState<V2Progress | null>(null)
  const [importStatus, setImportStatus] = useState<V2ImportStatus | null>(null)
  const hasRestoredPositionRef = useRef(false) // Flag để chỉ khôi phục vị trí một lần

  const loadInitial = useCallback(async () => {
    try {
      const [b, chaps, status] = await Promise.all([
        db.books.get(bookFingerprint),
        db.v2Chapters.where('bookFingerprint').equals(bookFingerprint).sortBy('spineIndex'),
        db.v2ImportStatus.get(bookFingerprint),
      ])
      console.log('[v2 Reader][debug] loadInitial:', {
        bookFingerprint,
        hasBook: !!b,
        chaptersCount: chaps.length,
        importStatus,
      })
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

  const filteredChapters = useMemo(() => {
    if (!chapters.length) return []
    if (!chapterSearchQuery.trim()) return chapters
    const query = chapterSearchQuery.toLowerCase()
    return chapters.filter((chapter, index) => {
      const chapterNum = `chương ${index + 1}`.toLowerCase()
      const title = chapter.title?.toLowerCase().trim() || ''
      return chapterNum.includes(query) || title.includes(query)
    })
  }, [chapters, chapterSearchQuery])

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

  const loadChapter = useCallback(
    async (index: number) => {
      if (!chapters[index]) return
      const chapter = chapters[index]
      try {
        stop()
        setLoadingSentences(true)
        setSentences([])
        setSentencesError(null)
        // Reset flag khi load chapter mới để có thể khôi phục vị trí cho chapter này
        hasRestoredPositionRef.current = false

        let html = chapter.xhtmlHtml
        if (index === 1) {
          console.log('[v2 Reader][debug] Loading chapter 2 metadata:', {
            index,
            chapterId: chapter.chapterId,
            spineIndex: chapter.spineIndex,
            hasXhtmlHtml: !!chapter.xhtmlHtml,
            xhtmlLength: chapter.xhtmlHtml?.length ?? 0,
          })
        }
        // Fallback: nếu DB không có content (xhtmlHtml), load trực tiếp từ EPUB gốc
        if (!html) {
          try {
            const fileRecord = (await db.bookFiles.get(bookFingerprint)) as BookFile | undefined
            if (fileRecord?.blob) {
              const epubData = await fileRecord.blob.arrayBuffer()
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const ePub = (await import('epubjs')).default as any
              const bookEpub: any = ePub(epubData)
              await bookEpub.ready

              const extractHtmlFromSection = (section: any): string => {
                if (!section) return ''
                if (typeof section === 'string') return section

                const candidates: Array<unknown> = [
                  (section as any).outerHTML,
                  section.contents?.innerHTML,
                  section.document?.body?.innerHTML,
                  section.document?.documentElement?.outerHTML,
                  (section as any).string,
                  (section as any).output,
                  typeof (section as any).text === 'string' ? (section as any).text : undefined,
                ]

                for (const c of candidates) {
                  if (typeof c === 'string' && c.trim().length > 0) {
                    return c
                  }
                }

                const asString = String(section)
                if (
                  asString &&
                  asString.trim().length > 0 &&
                  asString !== '[object Object]' &&
                  asString !== '[object HTMLHtmlElement]'
                ) {
                  return asString
                }

                return ''
              }

              // Try multiple methods to load chapter content
              let section: any = null
              
              // 1) Try resources API first
              const resources = bookEpub.resources
              if (resources) {
                let resource = resources.get(chapter.chapterId)
                if (!resource && !chapter.chapterId.startsWith('/')) {
                  resource = resources.get('/' + chapter.chapterId)
                }
                if (!resource && resources.each) {
                  resources.each((res: any, key: string) => {
                    if (key === chapter.chapterId || key.endsWith(chapter.chapterId) || key.includes(chapter.chapterId)) {
                      resource = res
                      return false
                    }
                  })
                }
                if (resource && typeof resource.text === 'function') {
                  html = await resource.text()
                } else if (resource && typeof resource.load === 'function') {
                  section = await resource.load(bookEpub.load.bind(bookEpub))
                }
              }

              // 2) Try bookEpub.load() if resources didn't work
              if (!html && !section) {
                section = await bookEpub.load(chapter.chapterId)
              }

              // Extract HTML from section if we got one
              if (!html && section) {
                html = extractHtmlFromSection(section)
              }

              if (index === 1) {
                console.log('[v2 Reader][debug] Fallback loaded chapter 2 from EPUB:', {
                  chapterId: chapter.chapterId,
                  htmlLength: html?.length || 0,
                  hasSection: !!section,
                })
              }
            }
          } catch (fallbackErr) {
            console.error('[v2 Reader] Fallback load chapter from EPUB failed:', fallbackErr)
          }
        }

        if (!html) {
          throw new Error('Không đọc được nội dung chương từ EPUB')
        }

        const buildSentencesAndHtml = (
          htmlContent: string,
        ): {
          sentences: Sentence[]
          html: string
        } => {
          const extracted: Sentence[] = []
          try {
            const parser = new DOMParser()
            const doc = parser.parseFromString(htmlContent, 'text/html')

            // 1) Nếu đã có span đánh dấu câu (như v1) thì chỉ cần đọc lại
            let sentenceSpans = doc.querySelectorAll('span[data-sent][id]')
            if (sentenceSpans.length === 0) {
              sentenceSpans = doc.querySelectorAll('span[id^="s-"]')
            }
            if (sentenceSpans.length > 0) {
              sentenceSpans.forEach((span) => {
                const idxAttr = span.getAttribute('data-sent')
                const sentenceIndex = idxAttr
                  ? parseInt(idxAttr, 10)
                  : (() => {
                      const id = span.getAttribute('id') || ''
                      const match = id.match(/s-(\d+)/)
                      return match ? parseInt(match[1], 10) : -1
                    })()
                const markerId = span.getAttribute('id') || ''
                const text = span.textContent || (span as HTMLElement).innerText || ''
                if (markerId && text.trim() && sentenceIndex >= 0) {
                  extracted.push({ sentenceIndex, text: text.trim(), markerId })
                }
              })
              extracted.sort((a, b) => a.sentenceIndex - b.sentenceIndex)
              return { sentences: extracted, html: htmlContent }
            }

            // 2) Nếu EPUB thô không có span, tự chia câu & thêm span vào DOM
            const root = (doc.body || doc.documentElement) as HTMLElement | null
            if (!root) return { sentences: [], html: htmlContent }

            const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
            const textNodes: Text[] = []
            while (walker.nextNode()) {
              const node = walker.currentNode as Text
              if (!node.nodeValue || !node.nodeValue.trim()) continue
              textNodes.push(node)
            }

            let sentenceIndex = 0
            const sentenceRegex = /([^.!?…。？！]+[.!?…。？！]*)/g

            textNodes.forEach((textNode) => {
              const parent = textNode.parentNode as HTMLElement | null
              if (!parent) return
              const text = textNode.nodeValue || ''
              const parts: string[] = []
              let match: RegExpExecArray | null
              while ((match = sentenceRegex.exec(text)) !== null) {
                const s = match[1].trim()
                if (s) parts.push(s)
              }
              if (parts.length === 0) return

              const frag = doc.createDocumentFragment()
              parts.forEach((part, idx) => {
                const span = doc.createElement('span')
                const markerId = `s-${sentenceIndex}`
                span.setAttribute('id', markerId)
                span.setAttribute('data-sent', String(sentenceIndex))
                span.textContent = part
                frag.appendChild(span)
                if (idx !== parts.length - 1) {
                  frag.appendChild(doc.createTextNode(' '))
                }

                extracted.push({
                  sentenceIndex,
                  text: part,
                  markerId,
                })
                sentenceIndex++
              })

              parent.replaceChild(frag, textNode)
            })

            return {
              sentences: extracted,
              html: root.innerHTML || htmlContent,
            }
          } catch (err) {
            console.error('[v2 ExtractSentences] Error extracting sentences:', err)
            return { sentences: [], html: htmlContent }
          }
        }

        const { sentences: builtSentences, html: processedHtml } = buildSentencesAndHtml(html)

        setChapterContent(processedHtml)

        setTimeout(() => {
          if (mainRef.current) {
            mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
          }
        }, 100)

        setSentences(builtSentences)
      } catch (err: any) {
        console.error('Failed to load chapter (v2):', err)
        setSentencesError(err.message || 'Failed to load chapter')
        setSentences([])
      } finally {
        setLoadingSentences(false)
      }
    },
    [chapters, stop],
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
          await loadChapter(chapterIndex)
        } else {
          await loadChapter(0)
        }
      } catch (error) {
        console.error('Failed to find last read chapter:', error)
        await loadChapter(0)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters.length])

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
          
          console.log('[v2 Reader] Restoring reading position:', {
            chapterId: progress.chapterId,
            sentenceIndex: progress.sentenceIndex,
            totalSentences: sentences.length,
            currentIndex: currentSentenceIndex,
            sentenceText: targetSentence.text.substring(0, 50),
            isPlaying,
          })
          
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
  }, [progress, sentences.length, currentChapter, seek, currentSentenceIndex])

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

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isPlaying) stop()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isPlaying, stop])

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

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                stop()
                const newIndex = Math.max(0, currentChapterIndex - 1)
                setCurrentChapterIndex(newIndex)
                loadChapter(newIndex)
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
                    Chương {currentChapterIndex + 1} / {chapters.length}
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
                      const index = chapters.findIndex((ch) => ch.id === chapter.id)
                      return (
                        <DropdownMenuItem
                          key={chapter.id}
                          onSelect={() => {
                            stop()
                            setCurrentChapterIndex(index)
                            loadChapter(index)
                            setChapterSearchOpen(false)
                            setChapterSearchQuery('')
                          }}
                          className={cn('cursor-pointer px-3 py-2', index === currentChapterIndex && 'bg-accent')}
                        >
                          <div className="flex flex-col gap-0.5 w-full min-w-0">
                            <span className="font-medium text-sm truncate">Chương {index + 1}</span>
                            {chapter.title && (
                              <span className="text-xs text-muted-foreground line-clamp-1 truncate">
                                {chapter.title.trim()}
                              </span>
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
                const newIndex = Math.min(chapters.length - 1, currentChapterIndex + 1)
                setCurrentChapterIndex(newIndex)
                loadChapter(newIndex)
              }}
              disabled={currentChapterIndex === chapters.length - 1}
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

