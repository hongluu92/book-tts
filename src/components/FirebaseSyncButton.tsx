'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Loader2, LogOut, Cloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCurrentUser, signOutUser, isAuthenticated, onAuthStateChange } from '@/lib/firebaseAuth'
import { useFirebaseSync } from '@/hooks/useFirebaseSync'
import FirebaseAuthModal from './FirebaseAuthModal'

export default function FirebaseSyncButton() {
  const [user, setUser] = useState(getCurrentUser())
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [hasNewData, setHasNewData] = useState(false)
  const { syncing, error, syncNow, checkForNewData } = useFirebaseSync()

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChange((currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        // Check for new data when user logs in
        checkForNewData().then((status) => {
          setHasNewData(status.hasNewData)
        })
      } else {
        setHasNewData(false)
      }
    })

    return () => unsubscribe()
  }, [checkForNewData])

  // Periodically check for new data when authenticated
  useEffect(() => {
    if (!user) return

    const interval = setInterval(async () => {
      const status = await checkForNewData()
      setHasNewData(status.hasNewData)
    }, 30000) // Check every 30 seconds

    return () => clearInterval(interval)
  }, [user, checkForNewData])

  const handleSyncClick = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    try {
      await syncNow()
      // Re-check for new data after sync
      const status = await checkForNewData()
      setHasNewData(status.hasNewData)
    } catch (err) {
      console.error('Sync failed:', err)
    }
  }

  const handleLogout = async () => {
    try {
      await signOutUser()
      setHasNewData(false)
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  const handleAuthSuccess = async () => {
    setShowAuthModal(false)
    // Check for new data after successful auth
    const status = await checkForNewData()
    setHasNewData(status.hasNewData)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <div className="relative">
              <Button
                onClick={handleSyncClick}
                variant="outline"
                size="icon"
                className="h-9 w-9"
                title={syncing ? 'Syncing...' : hasNewData ? 'New data available - Click to sync' : 'Sync now'}
                disabled={syncing}
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 stroke-[2] animate-spin" />
                ) : (
                  <RefreshCw
                    className={`h-4 w-4 stroke-[2] ${hasNewData ? 'text-green-600 dark:text-green-400' : ''}`}
                  />
                )}
              </Button>
              {hasNewData && !syncing && (
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-white dark:border-slate-800"></span>
              )}
            </div>
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              title="Sign out"
            >
              <LogOut className="h-4 w-4 stroke-[2]" />
            </Button>
          </>
        ) : (
          <Button
            onClick={() => setShowAuthModal(true)}
            variant="outline"
            size="icon"
            className="h-9 w-9"
            title="Sign in to sync across devices"
          >
            <Cloud className="h-4 w-4 stroke-[2]" />
          </Button>
        )}
      </div>

      {error && (
        <div className="absolute top-16 right-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-2 rounded text-sm max-w-xs">
          {error}
        </div>
      )}

      <FirebaseAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  )
}
