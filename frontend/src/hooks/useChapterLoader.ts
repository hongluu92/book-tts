import { useCallback, useRef, useState } from 'react'
import { V2Chapter } from '@/storage/db'
import { Sentence } from '@/lib/tts/types'
import { loadChapterFromEpub, buildSentencesAndHtml } from '@/lib/epubHelpers'

interface UseChapterLoaderOptions {
  chapters: V2Chapter[]
  bookFingerprint: string
  onStop: () => void
  scrollContainerRef: React.RefObject<HTMLElement>
}

export function useChapterLoader({
  chapters,
  bookFingerprint,
  onStop,
  scrollContainerRef,
}: UseChapterLoaderOptions) {
  const hasRestoredPositionRef = useRef(false)
  const [loadingSentences, setLoadingSentences] = useState(false)
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [chapterContent, setChapterContent] = useState<string>('')
  const [sentencesError, setSentencesError] = useState<string | null>(null)

  const loadChapter = useCallback(
    async (index: number) => {
      if (!chapters[index]) return
      const chapter = chapters[index]

      try {
        onStop()
        setLoadingSentences(true)
        setSentences([])
        setSentencesError(null)
        // Reset flag khi load chapter mới để có thể khôi phục vị trí cho chapter này
        hasRestoredPositionRef.current = false

        let html = chapter.xhtmlHtml

        // Fallback: nếu DB không có content (xhtmlHtml), load trực tiếp từ EPUB gốc
        if (!html) {
          try {
            html = await loadChapterFromEpub(bookFingerprint, chapter.chapterId)
          } catch (fallbackErr) {
            console.error('[v2 Reader] Fallback load chapter from EPUB failed:', fallbackErr)
          }
        }

        if (!html) {
          throw new Error('Không đọc được nội dung chương từ EPUB')
        }

        const { sentences: builtSentences, html: processedHtml } = buildSentencesAndHtml(html)

        setChapterContent(processedHtml)

        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
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
    [chapters, bookFingerprint, onStop, scrollContainerRef],
  )

  return {
    loadChapter,
    hasRestoredPositionRef,
    loadingSentences,
    sentences,
    chapterContent,
    sentencesError,
    setSentences,
  }
}
