'use client'

import { useEffect } from 'react'

/**
 * In development, next-pwa disables registration, but an old service worker
 * from a previous production build can still control localhost and break CSS/JS.
 * This component force-unregisters SW in dev to avoid "missing styles" issues.
 */
export default function DevServiceWorkerCleaner() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    ;(async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        if (!regs.length) return
        await Promise.all(regs.map((r) => r.unregister()))
        // Best-effort: clear Cache Storage too
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        }
        // Reload once to ensure fresh assets
        window.location.reload()
      } catch {
        // ignore
      }
    })()
  }, [])

  return null
}

