export type GoogleDriveToken = {
  accessToken: string
  expiresAtMs: number
}

declare global {
  interface Window {
    google?: any
  }
}

const STORAGE_KEY = 'google_drive_token_v1'

function nowMs() {
  return Date.now()
}

export function getGoogleDriveToken(): GoogleDriveToken | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as GoogleDriveToken
    if (!parsed?.accessToken || !parsed?.expiresAtMs) return null
    // 60s skew
    if (parsed.expiresAtMs - nowMs() < 60_000) return null
    return parsed
  } catch {
    return null
  }
}

export function clearGoogleDriveToken() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

let tokenClientPromise: Promise<any> | null = null

async function getTokenClient() {
  if (typeof window === 'undefined') throw new Error('Google auth is only available in the browser')

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID')
  }

  if (tokenClientPromise) return tokenClientPromise

  tokenClientPromise = new Promise((resolve, reject) => {
    const start = nowMs()
    const waitForGsi = () => {
      const g = window.google
      if (g?.accounts?.oauth2?.initTokenClient) {
        const tokenClient = g.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.appdata',
          callback: () => {},
        })
        resolve(tokenClient)
        return
      }
      if (nowMs() - start > 10_000) {
        reject(new Error('Google Identity Services script not loaded'))
        return
      }
      setTimeout(waitForGsi, 50)
    }
    waitForGsi()
  })

  return tokenClientPromise
}

export async function requestGoogleDriveAccessToken(options?: {
  interactive?: boolean
}): Promise<GoogleDriveToken> {
  const interactive = options?.interactive ?? true
  const existing = getGoogleDriveToken()
  if (existing) return existing

  const tokenClient = await getTokenClient()

  const token = await new Promise<GoogleDriveToken>((resolve, reject) => {
    tokenClient.callback = (resp: any) => {
      if (resp?.error) {
        reject(new Error(resp.error_description || resp.error || 'Google auth failed'))
        return
      }

      const accessToken = resp.access_token as string | undefined
      const expiresIn = resp.expires_in as number | undefined
      if (!accessToken || !expiresIn) {
        reject(new Error('Invalid token response from Google'))
        return
      }

      const next: GoogleDriveToken = {
        accessToken,
        expiresAtMs: nowMs() + expiresIn * 1000,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      resolve(next)
    }

    tokenClient.requestAccessToken({
      // Try silent when non-interactive; otherwise force consent UI as needed
      prompt: interactive ? 'consent' : '',
    })
  })

  return token
}

export function isGoogleDriveSignedIn(): boolean {
  return !!getGoogleDriveToken()
}

