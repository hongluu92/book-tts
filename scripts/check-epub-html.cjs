// Simple node script to debug EPUB -> HTML extraction without Playwright.
// Usage (from frontend/):
//   node scripts/check-epub-html.cjs

/* eslint-disable no-console */

const fs = require('fs')
const path = require('path')
const ePub = require('epubjs')

async function main() {
  const epubPath = path.resolve(__dirname, '../../thamkhongbingan.epub')
  const buf = fs.readFileSync(epubPath)
  const array = new Uint8Array(buf)
  const epubData = array.buffer

  const book = ePub(epubData)
  await book.ready

  const spineItems = book.spine?.spineItems || book.spine?.items || []
  console.log('[check-epub-html] spine length =', spineItems.length)
  console.log(
    '[check-epub-html] first 5 hrefs =',
    spineItems.slice(0, 5).map((it) => it.href),
  )

  const targetHref = '00_dtv-ebook-tien.xhtml'
  const resource = book.resources?.get(targetHref)

  if (!resource) {
    console.log('[check-epub-html] resource not found for href =', targetHref)
    return
  }

  let html = ''
  if (typeof resource.text === 'function') {
    html = await resource.text()
  } else if (typeof resource.load === 'function') {
    const res = await resource.load(book.load.bind(book))
    html =
      res?.contents?.innerHTML ||
      res?.document?.body?.innerHTML ||
      res?.string ||
      (typeof res === 'string' ? res : res?.toString?.() || '')
  }

  console.log('[check-epub-html] html length for', targetHref, '=', html.length)
  console.log('----- first 400 chars -----')
  console.log(html.slice(0, 400))
}

main().catch((err) => {
  console.error('[check-epub-html] error:', err)
  process.exit(1)
})

