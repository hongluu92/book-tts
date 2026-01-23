'use client'

import { useState, useEffect } from 'react'
import { Database, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

/**
 * Component để debug và kiểm tra PWA cache status
 * Chỉ hiển thị trong development hoặc khi có query param ?debug=pwa
 */
export default function PWACacheDebug() {
  const [cacheStatus, setCacheStatus] = useState<{
    serviceWorker: 'supported' | 'not-supported' | 'checking'
    registered: boolean
    caches: string[]
    isSecure: boolean
  } | null>(null)

  useEffect(() => {
    // Chỉ hiển thị trong development hoặc khi có ?debug=pwa
    if (typeof window === 'undefined') return
    const urlParams = new URLSearchParams(window.location.search)
    const showDebug = process.env.NODE_ENV === 'development' || urlParams.get('debug') === 'pwa'
    
    if (!showDebug) return

    const checkCacheStatus = async () => {
      const status: {
        serviceWorker: 'supported' | 'not-supported' | 'checking'
        registered: boolean
        caches: string[]
        isSecure: boolean
      } = {
        serviceWorker: 'checking',
        registered: false,
        caches: [],
        isSecure: window.location.protocol === 'https:' || 
                 window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1',
      }

      // Check service worker support
      if ('serviceWorker' in navigator) {
        status.serviceWorker = 'supported'
        
        try {
          // Check if registered
          const registrations = await navigator.serviceWorker.getRegistrations()
          status.registered = registrations.length > 0
        } catch (e) {
          console.error('Error checking service worker:', e)
        }
      } else {
        status.serviceWorker = 'not-supported'
      }

      // Check caches
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys()
          status.caches = cacheNames
        } catch (e) {
          console.error('Error checking caches:', e)
        }
      }

      setCacheStatus(status)
    }

    checkCacheStatus()
    // Refresh every 5 seconds
    const interval = setInterval(checkCacheStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  if (!cacheStatus) return null

  return (
    <div className="fixed bottom-4 left-4 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg shadow-lg p-4 max-w-sm z-50 text-sm">
      <div className="flex items-center gap-2 mb-3">
        <Database className="h-4 w-4" />
        <h3 className="font-semibold">PWA Cache Debug</h3>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span>Service Worker:</span>
          {cacheStatus.serviceWorker === 'supported' ? (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              Supported
            </span>
          ) : cacheStatus.serviceWorker === 'not-supported' ? (
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3 w-3" />
              Not Supported
            </span>
          ) : (
            <span className="text-gray-500">Checking...</span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span>Registered:</span>
          {cacheStatus.registered ? (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              Yes
            </span>
          ) : (
            <span className="flex items-center gap-1 text-yellow-600">
              <AlertCircle className="h-3 w-3" />
              No
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span>HTTPS/Localhost:</span>
          {cacheStatus.isSecure ? (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              Yes
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3 w-3" />
              No
            </span>
          )}
        </div>

        <div>
          <span className="block mb-1">Caches ({cacheStatus.caches.length}):</span>
          {cacheStatus.caches.length > 0 ? (
            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 max-h-32 overflow-y-auto">
              {cacheStatus.caches.map((name) => (
                <li key={name} className="truncate">• {name}</li>
              ))}
            </ul>
          ) : (
            <span className="text-xs text-gray-500">No caches found</span>
          )}
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
            <p className="text-xs text-yellow-600">
              ⚠️ Service Worker disabled in dev mode
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Run: npm run build && npm start
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
