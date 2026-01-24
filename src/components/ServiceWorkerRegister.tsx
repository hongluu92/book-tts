'use client'

import { useEffect } from 'react'

/**
 * Component để register service worker manually
 * Đảm bảo service worker được register ngay cả khi next-pwa không tự động register
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV === 'development') return // Skip in dev mode

    // Chỉ register trong production
    if ('serviceWorker' in navigator) {
      const registerSW = async () => {
        try {
          // Đợi một chút để đảm bảo page đã load xong
          await new Promise((resolve) => setTimeout(resolve, 1000))

          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          })

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available, user will be notified
                }
              })
            }
          })

          // Check for updates periodically
          setInterval(() => {
            registration.update()
          }, 60 * 1000) // Check every minute
        } catch (error) {
          console.error('[PWA] Service Worker registration failed:', error)
        }
      }

      registerSW()
    }
  }, [])

  return null
}
