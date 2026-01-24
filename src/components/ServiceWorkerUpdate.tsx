'use client'

import { useEffect, useState } from 'react'

/**
 * Component để check và thông báo khi có service worker update
 * Cho phép user reload để nhận code mới
 */
export default function ServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [isReloading, setIsReloading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV === 'development') return

    let registration: ServiceWorkerRegistration | null = null

    const checkForUpdate = async () => {
      try {
        registration = await navigator.serviceWorker.ready

        // Listen for service worker update
        registration.addEventListener('updatefound', () => {
          const newWorker = registration?.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Có service worker mới đã được install
              setUpdateAvailable(true)
            }
          })
        })

        // Check for updates mỗi 1 phút
        setInterval(() => {
          registration?.update()
        }, 60 * 1000)
      } catch (error) {
        console.error('Service worker update check failed:', error)
      }
    }

    // Check ngay khi component mount
    checkForUpdate()

    // Listen for controller change (khi service worker mới đã activate)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Reload page để nhận code mới
      if (!isReloading) {
        setIsReloading(true)
        window.location.reload()
      }
    })
  }, [isReloading])

  const handleReload = () => {
    setIsReloading(true)
    window.location.reload()
  }

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
      <div className="bg-blue-600 text-white rounded-lg shadow-lg p-4 flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="font-semibold">Có bản cập nhật mới!</p>
          <p className="text-sm text-blue-100">Nhấn để tải lại và nhận code mới</p>
        </div>
        <button
          onClick={handleReload}
          disabled={isReloading}
          className="bg-white text-blue-600 px-4 py-2 rounded font-semibold hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isReloading ? 'Đang tải...' : 'Tải lại'}
        </button>
      </div>
    </div>
  )
}
