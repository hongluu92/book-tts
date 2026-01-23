'use client'

import { useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { requestGoogleDriveAccessToken, clearGoogleDriveToken, isGoogleDriveSignedIn } from '@/lib/googleDriveAuth'
import { Button } from '@/components/ui/button'

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
          <Button
            onClick={handleDisconnect}
            variant="outline"
            size="icon"
            className="h-9 w-9"
            title="Disconnect Google Drive"
          >
            <RefreshCw className="h-4 w-4 stroke-[2] text-green-600 dark:text-green-400" />
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={busy}
            variant="outline"
            size="icon"
            className="h-9 w-9"
            title="Connect Google Drive (sync progress)"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 stroke-[2] animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 stroke-[2]" />
            )}
          </Button>
        )}
      </div>
      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}

