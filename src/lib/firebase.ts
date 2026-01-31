import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getAuth, Auth } from 'firebase/auth'
import { getFirestore, Firestore } from 'firebase/firestore'
import { getStorage, FirebaseStorage } from 'firebase/storage'

// Lazy initialization - only initialize when actually needed (client-side)
let app: FirebaseApp | null = null
let _auth: Auth | null = null
let _db: Firestore | null = null
let _storage: FirebaseStorage | null = null

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  }
}

function isFirebaseConfigured() {
  const config = getFirebaseConfig()
  return !!(
    config.apiKey &&
    config.authDomain &&
    config.projectId &&
    config.storageBucket &&
    config.messagingSenderId &&
    config.appId &&
    config.apiKey !== 'dummy' &&
    config.apiKey !== 'undefined'
  )
}

function initializeFirebase(): FirebaseApp | null {
  // Only initialize on client-side
  if (typeof window === 'undefined') {
    return null
  }

  // Return existing app if already initialized
  if (app) {
    return app
  }

  // Check if config is valid
  if (!isFirebaseConfigured()) {
    return null
  }

  try {
    const firebaseConfig = getFirebaseConfig()
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig)
    } else {
      app = getApps()[0]
    }
    return app
  } catch (error) {
    // Silently fail during build - Firebase is optional
    if (process.env.NODE_ENV !== 'production' || typeof window !== 'undefined') {
      console.warn('Firebase initialization failed:', error)
    }
    return null
  }
}

// Lazy getters - only initialize when accessed
function getAuthInstance(): Auth | null {
  if (typeof window === 'undefined') return null
  if (!_auth) {
    const firebaseApp = initializeFirebase()
    if (firebaseApp) {
      _auth = getAuth(firebaseApp)
    }
  }
  return _auth
}

function getDbInstance(): Firestore | null {
  if (typeof window === 'undefined') return null
  if (!_db) {
    const firebaseApp = initializeFirebase()
    if (firebaseApp) {
      _db = getFirestore(firebaseApp)
    }
  }
  return _db
}

function getStorageInstance(): FirebaseStorage | null {
  if (typeof window === 'undefined') return null
  if (!_storage) {
    const firebaseApp = initializeFirebase()
    if (firebaseApp) {
      _storage = getStorage(firebaseApp)
    }
  }
  return _storage
}

// Export getter functions for lazy initialization
// Use these instead of direct imports to avoid build-time initialization
export { getAuthInstance, getDbInstance, getStorageInstance }

// For backward compatibility, export direct instances (will be null during build)
// These should only be used in client-side code with 'use client' directive
export const auth = getAuthInstance()
export const db = getDbInstance()
export const storage = getStorageInstance()

export default app
