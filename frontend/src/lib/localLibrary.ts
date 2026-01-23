import { db, BookLocal, V2Chapter, V2ImportStatus, BookCover } from '@/storage/db'
import { computeBookFingerprint } from '@/lib/bookFingerprint'
import ePub from 'epubjs'

function stripEpubExt(name: string) {
  return name.toLowerCase().endsWith('.epub') ? name.slice(0, -5) : name
}

export async function importLocalEpub(file: File): Promise<BookLocal> {
  if (!file.name.toLowerCase().endsWith('.epub')) {
    throw new Error('Please select an EPUB file')
  }

  const bookFingerprint = await computeBookFingerprint(file)

  const book: BookLocal = {
    bookFingerprint,
    title: stripEpubExt(file.name),
    author: null,
    addedAtMs: Date.now(),
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/epub+zip',
  }

  await db.transaction('rw', db.books, db.bookFiles, async () => {
    await db.bookFiles.put({ bookFingerprint, blob: file })
    await db.books.put(book)
  })

  // Extract cover and parse EPUB (best-effort, outside main transaction)
  extractAndStoreCover(bookFingerprint, file).catch((err) => {
    console.error('Failed to extract cover for local import (v2)', err)
  })

  parseAndStoreChapters(bookFingerprint, file).catch((err) => {
    console.error('Failed to parse EPUB for local import (v2)', err)
  })

  return book
}

async function extractAndStoreCover(bookFingerprint: string, file: File) {
  try {
    const epubData = await file.arrayBuffer()
    const bookEpub: any = ePub(epubData)
    await bookEpub.ready

    // Try to get cover from epub.js
    let coverBlob: Blob | null = null
    let coverMimeType = 'image/jpeg'

    try {
      // Method 1: Try epub.coverUrl() which epub.js provides
      if (typeof bookEpub.coverUrl === 'function') {
        const coverUrl = await bookEpub.coverUrl()
        if (coverUrl) {
          try {
            // coverUrl might be a blob URL, data URL, or regular URL
            const response = await fetch(coverUrl)
            coverBlob = await response.blob()
            coverMimeType = coverBlob.type || 'image/jpeg'
          } catch (fetchErr) {
            console.warn('[v2 Import] Failed to fetch cover from coverUrl', fetchErr)
          }
        }
      }
    } catch (err) {
      console.warn('[v2 Import] epub.coverUrl() failed, trying alternative methods', err)
    }

    // Method 2: Try to find cover in manifest/resources
    if (!coverBlob) {
      try {
        const resources = (bookEpub as any).resources
        if (resources) {
          // Look for cover in metadata
          const metadata = (bookEpub as any).packaging?.metadata || {}
          let coverId: string | undefined

          if (metadata.meta) {
            const metaArray = Array.isArray(metadata.meta) ? metadata.meta : [metadata.meta]
            const coverMeta = metaArray.find(
              (m: any) => m['@_name'] === 'cover' || m['@_property'] === 'cover-image',
            )
            coverId = coverMeta?.['@_content']
          }

          if (coverId) {
            const coverResource = resources.get(coverId)
            if (coverResource) {
              try {
                if (typeof coverResource.url === 'function') {
                  const url = await coverResource.url()
                  const response = await fetch(url)
                  coverBlob = await response.blob()
                  coverMimeType = coverBlob.type || 'image/jpeg'
                } else if (typeof coverResource.load === 'function') {
                  // Try loading the resource
                  const loaded = await coverResource.load(bookEpub.load.bind(bookEpub))
                  if (loaded && typeof loaded === 'string') {
                    // If it's a data URL
                    const response = await fetch(loaded)
                    coverBlob = await response.blob()
                    coverMimeType = coverBlob.type || 'image/jpeg'
                  }
                }
              } catch (loadErr) {
                console.warn('[v2 Import] Failed to load cover resource', loadErr)
              }
            }
          }

          // Method 3: Try common cover filenames
          if (!coverBlob) {
            const commonCoverNames = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.gif']
            for (const name of commonCoverNames) {
              try {
                const resource = resources.get(name) || resources.get('/' + name)
                if (resource) {
                  if (typeof resource.url === 'function') {
                    const url = await resource.url()
                    const response = await fetch(url)
                    coverBlob = await response.blob()
                    coverMimeType = coverBlob.type || 'image/jpeg'
                    break
                  } else if (typeof resource.load === 'function') {
                    const loaded = await resource.load(bookEpub.load.bind(bookEpub))
                    if (loaded && typeof loaded === 'string') {
                      const response = await fetch(loaded)
                      coverBlob = await response.blob()
                      coverMimeType = coverBlob.type || 'image/jpeg'
                      break
                    }
                  }
                }
              } catch (e) {
                // Continue to next name
              }
            }
          }
        }
      } catch (err) {
        console.warn('[v2 Import] Failed to extract cover from resources', err)
      }
    }

    if (coverBlob) {
      const cover: BookCover = {
        bookFingerprint,
        blob: coverBlob,
        mimeType: coverMimeType,
      }
      await db.bookCovers.put(cover)
      console.log('[v2 Import] Cover extracted and stored', { bookFingerprint, mimeType: coverMimeType })
    } else {
      console.log('[v2 Import] No cover found for book', bookFingerprint)
    }
  } catch (err) {
    console.error('[v2 Import] Error extracting cover', err)
    // Don't throw - cover extraction is optional
  }
}

async function parseAndStoreChapters(bookFingerprint: string, file: File) {
  // epub.js typings expect string/ArrayBuffer; use ArrayBuffer from File.
  const epubData = await file.arrayBuffer()
  const bookEpub: any = ePub(epubData)
  await bookEpub.ready

  const spine: any = bookEpub.spine
  const items: any[] = spine?.spineItems || spine?.items || []
  const totalChapters = items.length || 0

  const chapters: V2Chapter[] = []

  const status: V2ImportStatus = {
    bookFingerprint,
    totalChapters,
    parsedChapters: 0,
    updatedAtMs: Date.now(),
    lastError: null,
  }

  await db.v2ImportStatus.put(status)

  let index = 0
  for (const item of items) {
    try {
      const spineItem: any = item
      const href = (spineItem as any).href as string
      const chapterId = href
      const spineIndex = index
      index++

      // Prefer loading via resources API (ổn định hơn cho EPUB thực tế)
      let html = ''
      try {
        html = await loadChapterHtmlFromBook(bookEpub, href, spineItem)
        if (!html || html.trim().length === 0) {
          console.warn('[v2 Import] Empty HTML extracted for chapter:', {
            bookFingerprint,
            href,
            spineIndex,
            chapterId,
          })
        } else if (process.env.NODE_ENV !== 'production') {
          // Debug: log độ dài HTML để chắc đã đọc được nội dung
          console.log('[v2 Import][debug] Parsed chapter html:', {
            bookFingerprint,
            href,
            spineIndex,
            htmlLength: html?.length || 0,
            firstChars: html.substring(0, 100),
          })
        }
      } catch (innerErr: any) {
        console.error('[v2 Import] Failed to load EPUB spine item content:', {
          bookFingerprint,
          href,
          spineIndex,
          chapterId,
          error: innerErr?.message || String(innerErr),
          stack: innerErr?.stack,
        })
        html = ''
      }
      let title: string | null = null
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        const h = doc.querySelector('h1, h2, h3')
        title = h?.textContent?.trim() || null
      } catch {
        title = null
      }

      chapters.push({
        bookFingerprint,
        spineIndex,
        chapterId,
        title,
        xhtmlHtml: html,
      })

      status.parsedChapters = chapters.length
      status.updatedAtMs = Date.now()
      await db.v2ImportStatus.put(status)
    } catch (err: any) {
      console.warn('Failed to parse chapter from EPUB spine item', err)
      status.lastError = String(err?.message || err)
      status.updatedAtMs = Date.now()
      await db.v2ImportStatus.put(status)
    }
  }

  if (chapters.length > 0) {
    await db.transaction('rw', db.v2Chapters, db.v2ImportStatus, async () => {
      await db.v2Chapters.where('bookFingerprint').equals(bookFingerprint).delete()
      await db.v2Chapters.bulkAdd(chapters)
      status.parsedChapters = chapters.length
      status.updatedAtMs = Date.now()
      await db.v2ImportStatus.put(status)
    })
  }
}

// Exported only for testing and internal reuse
export async function loadChapterHtmlFromEpubForTest(epubData: ArrayBuffer, href: string): Promise<string> {
  const bookEpub: any = ePub(epubData)
  await bookEpub.ready
  return loadChapterHtmlFromBook(bookEpub, href, null)
}

async function loadChapterHtmlFromBook(bookEpub: any, href: string, spineItem: any | null): Promise<string> {
  let html = ''

  // Helper: extract HTML from a section / resource result in as many ways as possible
  const extractHtmlFromSection = (section: any): string => {
    if (!section) return ''
    if (typeof section === 'string') return section

    const candidates: Array<unknown> = [
      // Nếu section là một DOM element (vd: HTMLHtmlElement), ưu tiên outerHTML
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

    // Nhiều trường hợp section bản thân đã là HTML khi stringify
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

  // 1) Try resources API with different path formats
  const resources = (bookEpub as any).resources
  if (resources) {
    // Try exact href first
    let resource = resources.get(href)
    // Try with leading slash
    if (!resource && !href.startsWith('/')) {
      resource = resources.get('/' + href)
    }
    // Try to find by iterating if direct lookup fails
    if (!resource && resources.each) {
      resources.each((res: any, key: string) => {
        if (key === href || key.endsWith(href) || key.includes(href)) {
          resource = res
          return false // stop iteration
        }
      })
    }

    if (resource) {
      try {
        if (typeof resource.text === 'function') {
          html = await resource.text()
        } else if (typeof resource.load === 'function') {
          const res = await resource.load(bookEpub.load.bind(bookEpub))
          html = extractHtmlFromSection(res)
        } else if (typeof resource === 'string') {
          html = resource
        }
      } catch (err) {
        console.warn('[v2 Import] Failed to load resource.text()', href, err)
      }
    }
  }

  // 2) Fallback: spineItem.load (most reliable method)
  if (!html && spineItem) {
    try {
      if (typeof spineItem.load === 'function') {
        const section = await spineItem.load(bookEpub.load.bind(bookEpub))
        html = extractHtmlFromSection(section)
      }
    } catch (err) {
      console.warn('[v2 Import] spineItem.load failed', href, err)
    }
  }

  // 3) Final fallback: bookEpub.load(href)
  if (!html) {
    try {
      const section = await bookEpub.load(href)
      html = extractHtmlFromSection(section)
    } catch (err) {
      console.warn('[v2 Import] bookEpub.load() fallback failed', href, err)
    }
  }

  // Validate HTML was actually extracted
  if (!html || html.trim().length === 0) {
    const resourceKeys =
      resources && (resources as any).resources
        ? Object.keys((resources as any).resources)
        : undefined
    console.warn('[v2 Import] No HTML content extracted for href:', href, {
      href,
      hasSpineItem: !!spineItem,
      resourceKeysSample: Array.isArray(resourceKeys) ? resourceKeys.slice(0, 20) : undefined,
    })
  }

  return html || ''
}


export async function deleteLocalBook(bookFingerprint: string) {
  // Split into two transactions to avoid Dexie's store limit
  await db.transaction('rw', db.books, db.bookFiles, db.v2Progress, db.v2Chapters, async () => {
    await db.books.delete(bookFingerprint)
    await db.bookFiles.delete(bookFingerprint)
    await db.v2Progress.where('bookFingerprint').equals(bookFingerprint).delete()
    await db.v2Chapters.where('bookFingerprint').equals(bookFingerprint).delete()
  })
  
  await db.transaction('rw', db.v2ImportStatus, db.bookCovers, async () => {
    await db.v2ImportStatus.delete(bookFingerprint)
    await db.bookCovers.delete(bookFingerprint)
  })
}

