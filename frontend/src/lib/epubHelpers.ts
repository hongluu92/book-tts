import { Sentence } from '@/lib/tts/types'
import { BookFile } from '@/storage/db'
import { db } from '@/storage/db'

/**
 * Extract HTML content from an EPUB section object
 */
export function extractHtmlFromSection(section: any): string {
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

/**
 * Build sentences array and processed HTML from raw HTML content
 */
export function buildSentencesAndHtml(htmlContent: string): {
  sentences: Sentence[]
  html: string
} {
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

/**
 * Load chapter HTML from EPUB file as fallback when DB doesn't have content
 */
export async function loadChapterFromEpub(
  bookFingerprint: string,
  chapterId: string,
): Promise<string> {
  const fileRecord = (await db.bookFiles.get(bookFingerprint)) as BookFile | undefined
  if (!fileRecord?.blob) {
    throw new Error('EPUB file not found')
  }

  const epubData = await fileRecord.blob.arrayBuffer()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ePub = (await import('epubjs')).default as any
  const bookEpub: any = ePub(epubData)
  await bookEpub.ready

  // Try multiple methods to load chapter content
  let html = ''
  let section: any = null

  // 1) Try resources API first
  const resources = bookEpub.resources
  if (resources) {
    let resource = resources.get(chapterId)
    if (!resource && !chapterId.startsWith('/')) {
      resource = resources.get('/' + chapterId)
    }
    if (!resource && resources.each) {
      resources.each((res: any, key: string) => {
        if (key === chapterId || key.endsWith(chapterId) || key.includes(chapterId)) {
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
    section = await bookEpub.load(chapterId)
  }

  // Extract HTML from section if we got one
  if (!html && section) {
    html = extractHtmlFromSection(section)
  }

  if (!html) {
    throw new Error('Không đọc được nội dung chương từ EPUB')
  }

  return html
}
