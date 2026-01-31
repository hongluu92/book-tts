import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { getCurrentUser } from './firebaseAuth'

export interface FirebaseSettings {
  fontSize: number
  fontFamily: string
  theme: 'light' | 'dark'
  updatedAtMs: number
}

// Load settings from Firebase
export async function loadSettingsFromFirebase(): Promise<FirebaseSettings | null> {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('User not authenticated')
  }

  const userRef = doc(db, 'users', user.uid)
  const userDoc = await getDoc(userRef)

  if (!userDoc.exists()) {
    return null
  }

  const data = userDoc.data()
  return data.settings ? (data.settings as FirebaseSettings) : null
}

// Sync settings to Firebase (optional - can be local-only)
export async function syncSettingsToFirebase(settings: {
  fontSize: number
  fontFamily: string
  theme: 'light' | 'dark'
}): Promise<void> {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('User not authenticated')
  }

  const firebaseSettings: FirebaseSettings = {
    ...settings,
    updatedAtMs: Date.now(),
  }

  const userRef = doc(db, 'users', user.uid)
  await setDoc(userRef, { settings: firebaseSettings }, { merge: true })
}

// Merge settings (local wins by default, or last-write-wins)
export function mergeSettingsData(
  localSettings: { fontSize: number; fontFamily: string; theme: 'light' | 'dark' },
  remoteSettings: FirebaseSettings | null
): { fontSize: number; fontFamily: string; theme: 'light' | 'dark' } {
  // Option 1: Local-only (recommended) - return local as-is
  // Option 2: Last-write-wins - uncomment below
  /*
  if (remoteSettings && remoteSettings.updatedAtMs > Date.now() - 86400000) {
    // Remote is newer (within 24 hours), use remote
    return {
      fontSize: remoteSettings.fontSize,
      fontFamily: remoteSettings.fontFamily,
      theme: remoteSettings.theme,
    }
  }
  */
  return localSettings
}
