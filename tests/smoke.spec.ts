import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('v2 bookshelf & reader (local-only)', () => {
  test('bookshelf loads with v2 header', async ({ page }) => {
    await page.goto('/bookshelf', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'My Books' })).toBeVisible()
    await expect(page.getByText('v2 • local-only library • optional Drive progress sync')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open v1' })).toBeVisible()
  })

  test('import EPUB adds a book and can open reader', async ({ page }) => {
    await page.goto('/bookshelf', { waitUntil: 'networkidle' })

    const fileInput = page.locator('input[type="file"][accept=".epub"]')

    const epubPath = path.resolve(__dirname, '../../thamkhongbingan.epub')
    await fileInput.setInputFiles(epubPath)

    // If import fails, surface the banner error message first for debugging
    const errorBanner = page.locator('text=Import failed')
    if (await errorBanner.isVisible({ timeout: 5000 }).catch(() => false)) {
      const msg = (await errorBanner.textContent()) || 'Import failed'
      throw new Error(`Import error banner visible: ${msg}`)
    }

    // After import, at least one reader link card should appear on the bookshelf
    const readerLink = page.locator('a[href^="/reader/"]').first()
    await expect(readerLink).toBeVisible({ timeout: 15_000 })

    // Click the card to open reader
    await readerLink.click()
    await expect(page).toHaveURL(/\/reader\//)
    await expect(page.getByRole('heading')).toBeVisible()
  })
})


