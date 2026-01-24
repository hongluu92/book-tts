'use client'

import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'

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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500 dark:bg-yellow-600 text-white rounded-md text-sm">
      <WifiOff className="h-4 w-4 stroke-[2]" />
      <span className="hidden sm:inline">Offline - Reading from cache</span>
      <span className="sm:hidden">Offline</span>
    </div>
  )
}
