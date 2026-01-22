'use client'

import { useState, useEffect } from 'react'
import { WifiIcon } from '@heroicons/react/24/outline'

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    setIsOnline(navigator.onLine)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-500 dark:bg-yellow-600 text-white px-4 py-2 text-sm text-center z-50">
      <div className="flex items-center justify-center gap-2">
        <WifiIcon className="h-4 w-4" />
        <span>Offline - Reading from cache</span>
      </div>
    </div>
  )
}
