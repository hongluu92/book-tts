'use client'

import { useState } from 'react'
import { requestGoogleDriveAccessToken, clearGoogleDriveToken, isGoogleDriveSignedIn } from '@/lib/googleDriveAuth'

export default function DriveSyncButton() {
  const [busy, setBusy] = useState(false)
  const [signedIn, setSignedIn] = useState(isGoogleDriveSignedIn())
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async () => {
    setError(null)
    setBusy(true)
    try {
      await requestGoogleDriveAccessToken({ interactive: true })
      setSignedIn(true)
    } catch (e: any) {
      setError(e?.message || 'Google sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = () => {
    clearGoogleDriveToken()
    setSignedIn(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {signedIn ? (
          <>
            <span className="text-sm text-green-600 dark:text-green-400">Drive sync: Connected</span>
            <button
              onClick={handleDisconnect}
              className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={handleConnect}
            disabled={busy}
            className="text-sm px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Connecting…' : 'Connect Google Drive (sync progress)'}
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}

