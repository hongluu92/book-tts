'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle, Info } from 'lucide-react'

/**
 * Button để sync lại PWA configuration:
 * - Check và update service worker
 * - Clear cache cũ nếu cần
 * - Reload để nhận code mới
 */
export default function PWASyncButton() {
  const [isUpdating, setIsUpdating] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [hasUpdate, setHasUpdate] = useState(false)
  const [isSupported, setIsSupported] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check service worker support
    const checkSupport = () => {
      const hasServiceWorker = 'serviceWorker' in navigator
      const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      setIsSupported(hasServiceWorker && isSecure)
      return hasServiceWorker && isSecure
    }

    if (!checkSupport()) {
      return
    }

    const checkForUpdate = async () => {
      try {
        // Wait for service worker to be ready (có thể mất thời gian trên mobile)
        const registration = await navigator.serviceWorker.ready.catch(() => null)
        if (!registration) return

        registration.addEventListener('updatefound', () => {
          setHasUpdate(true)
        })
        // Check for updates
        await registration.update()
      } catch (error) {
        // Service worker chưa ready hoặc chưa có - không sao
        console.log('Service worker not ready yet:', error)
      }
    }

    // Chỉ check update trong production hoặc khi service worker đã ready
    if (process.env.NODE_ENV === 'production') {
      // Delay một chút để đảm bảo service worker đã register
      setTimeout(() => {
        checkForUpdate()
      }, 1000)
      // Check every 5 minutes
      const interval = setInterval(checkForUpdate, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [])

  const handleSync = async () => {
    if (typeof window === 'undefined') return
    
    // Check support
    const hasServiceWorker = 'serviceWorker' in navigator
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    
    if (!hasServiceWorker) {
      alert('Service Worker không được hỗ trợ trên trình duyệt này.\n\nTrên iOS Safari, bạn cần thêm app vào Home Screen để sử dụng PWA.')
      return
    }

    if (!isSecure) {
      alert('Service Worker chỉ hoạt động trên HTTPS hoặc localhost.\n\nVui lòng truy cập qua HTTPS hoặc localhost.')
      return
    }

    setIsUpdating(true)
    setStatus('idle')

    try {
      // 1. Unregister old service workers
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((reg) => reg.unregister()))

      // 2. Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((name) => caches.delete(name)))
      }

      // 3. Reload page to register new service worker
      setStatus('success')
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (error) {
      console.error('Error syncing PWA:', error)
      setStatus('error')
      setIsUpdating(false)
      alert('Có lỗi xảy ra khi sync. Vui lòng thử lại.')
    }
  }

  // Nếu không hỗ trợ, hiển thị button với thông báo
  if (isSupported === false) {
    return (
      <button
        onClick={() => {
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
          const isAndroid = /Android/.test(navigator.userAgent)
          let message = 'Service Worker không khả dụng.\n\n'
          
          if (isIOS) {
            message += 'Trên iOS Safari:\n- Thêm app vào Home Screen để sử dụng PWA\n- Hoặc sử dụng Chrome/Firefox trên iOS'
          } else if (isAndroid) {
            message += 'Vui lòng sử dụng Chrome hoặc Firefox trên Android'
          } else {
            message += 'Vui lòng sử dụng trình duyệt hỗ trợ Service Worker (Chrome, Firefox, Safari, Edge)'
          }
          
          alert(message)
        }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600"
        title="Service Worker không được hỗ trợ - Click để xem hướng dẫn"
      >
        <Info className="h-4 w-4" />
        <span className="hidden sm:inline">PWA</span>
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={handleSync}
        disabled={isUpdating}
        className={`
          flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-sm
          transition-colors disabled:opacity-50 disabled:cursor-not-allowed
          ${
            hasUpdate
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
          }
        `}
        title={hasUpdate ? 'Có bản cập nhật mới - Click để sync' : 'Sync lại PWA configuration'}
      >
        {isUpdating ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="hidden sm:inline">Đang sync...</span>
          </>
        ) : status === 'success' ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            <span className="hidden sm:inline">Đã sync</span>
          </>
        ) : status === 'error' ? (
          <>
            <AlertCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Lỗi</span>
          </>
        ) : (
          <>
            <RefreshCw className={`h-4 w-4 ${hasUpdate ? 'text-white' : ''}`} />
            <span className="hidden sm:inline">{hasUpdate ? 'Có update' : 'Sync PWA'}</span>
            <span className="sm:hidden">{hasUpdate ? 'Update' : 'Sync'}</span>
          </>
        )}
      </button>
      {hasUpdate && !isUpdating && (
        <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-pulse" />
      )}
    </div>
  )
}
