import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  User,
  sendEmailVerification,
  onAuthStateChanged,
  AuthError,
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { getAuthInstance, getDbInstance } from './firebase'

export interface AuthErrorWithCode extends Error {
  code?: string
}

// Auth state listener
export function onAuthStateChange(callback: (user: User | null) => void) {
  const authInstance = getAuthInstance()
  if (!authInstance) {
    // Firebase not initialized, return no-op unsubscribe
    return () => {}
  }
  return onAuthStateChanged(authInstance, callback)
}

// Get current user
export function getCurrentUser(): User | null {
  const authInstance = getAuthInstance()
  return authInstance?.currentUser || null
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  const authInstance = getAuthInstance()
  return authInstance?.currentUser !== null
}

// Sign up with email and password
export async function signUp(email: string, password: string): Promise<User> {
  const authInstance = getAuthInstance()
  const dbInstance = getDbInstance()
  if (!authInstance || !dbInstance) {
    throw new Error('Firebase is not initialized. Make sure Firebase config is set.')
  }
  
  try {
    const userCredential = await createUserWithEmailAndPassword(authInstance, email, password)
    const user = userCredential.user

    // Create user document in Firestore
    await setDoc(doc(dbInstance, 'users', user.uid), {
      email: user.email,
      createdAt: new Date().toISOString(),
      syncMetadata: {
        lastSyncAtMs: 0,
        lastLocalChangeAtMs: 0,
      },
    })

    // Optional: Send email verification
    // await sendEmailVerification(user)

    return user
  } catch (error: any) {
    const authError: AuthErrorWithCode = new Error(error.message || 'Sign up failed')
    authError.code = error.code
    throw authError
  }
}

// Sign in with email and password
export async function signIn(email: string, password: string): Promise<User> {
  const authInstance = getAuthInstance()
  if (!authInstance) {
    throw new Error('Firebase is not initialized. Make sure Firebase config is set.')
  }
  
  try {
    const userCredential = await signInWithEmailAndPassword(authInstance, email, password)
    return userCredential.user
  } catch (error: any) {
    const authError: AuthErrorWithCode = new Error(error.message || 'Sign in failed')
    authError.code = error.code
    throw authError
  }
}

// Sign in with Google
export async function signInWithGoogle(): Promise<User> {
  const authInstance = getAuthInstance()
  const dbInstance = getDbInstance()
  if (!authInstance || !dbInstance) {
    throw new Error('Firebase is not initialized. Make sure Firebase config is set.')
  }
  
  try {
    const provider = new GoogleAuthProvider()
    const userCredential = await signInWithPopup(authInstance, provider)
    const user = userCredential.user

    // Check if user document exists, create if not
    const userDoc = await getDoc(doc(dbInstance, 'users', user.uid))
    if (!userDoc.exists()) {
      await setDoc(doc(dbInstance, 'users', user.uid), {
        email: user.email,
        createdAt: new Date().toISOString(),
        syncMetadata: {
          lastSyncAtMs: 0,
          lastLocalChangeAtMs: 0,
        },
      })
    }

    return user
  } catch (error: any) {
    const authError: AuthErrorWithCode = new Error(error.message || 'Google sign in failed')
    authError.code = error.code
    throw authError
  }
}

// Sign out
export async function signOutUser(): Promise<void> {
  const authInstance = getAuthInstance()
  if (!authInstance) {
    throw new Error('Firebase is not initialized. Make sure Firebase config is set.')
  }
  
  try {
    await signOut(authInstance)
  } catch (error: any) {
    const authError: AuthErrorWithCode = new Error(error.message || 'Sign out failed')
    authError.code = error.code
    throw authError
  }
}

// Reset password
export async function resetPassword(email: string): Promise<void> {
  const authInstance = getAuthInstance()
  if (!authInstance) {
    throw new Error('Firebase is not initialized. Make sure Firebase config is set.')
  }
  
  try {
    await sendPasswordResetEmail(authInstance, email)
  } catch (error: any) {
    const authError: AuthErrorWithCode = new Error(error.message || 'Password reset failed')
    authError.code = error.code
    throw authError
  }
}

// Send email verification
export async function sendVerificationEmail(): Promise<void> {
  const authInstance = getAuthInstance()
  if (!authInstance) {
    throw new Error('Firebase is not initialized. Make sure Firebase config is set.')
  }
  
  const user = authInstance.currentUser
  if (!user) {
    throw new Error('No user is signed in')
  }
  try {
    await sendEmailVerification(user)
  } catch (error: any) {
    const authError: AuthErrorWithCode = new Error(error.message || 'Failed to send verification email')
    authError.code = error.code
    throw authError
  }
}

// Get user-friendly error message
export function getAuthErrorMessage(error: AuthErrorWithCode): string {
  switch (error.code) {
    case 'auth/email-already-in-use':
      return 'Email already in use. Please sign in instead.'
    case 'auth/invalid-email':
      return 'Invalid email address.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/user-not-found':
      return 'No account found with this email.'
    case 'auth/wrong-password':
      return 'Incorrect password.'
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.'
    default:
      return error.message || 'An error occurred. Please try again.'
  }
}
