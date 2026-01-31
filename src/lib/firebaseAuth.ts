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
import { auth, db } from './firebase'

export interface AuthErrorWithCode extends Error {
  code?: string
}

// Auth state listener
export function onAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}

// Get current user
export function getCurrentUser(): User | null {
  return auth.currentUser
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  return auth.currentUser !== null
}

// Sign up with email and password
export async function signUp(email: string, password: string): Promise<User> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const user = userCredential.user

    // Create user document in Firestore
    await setDoc(doc(db, 'users', user.uid), {
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
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    return userCredential.user
  } catch (error: any) {
    const authError: AuthErrorWithCode = new Error(error.message || 'Sign in failed')
    authError.code = error.code
    throw authError
  }
}

// Sign in with Google
export async function signInWithGoogle(): Promise<User> {
  try {
    const provider = new GoogleAuthProvider()
    const userCredential = await signInWithPopup(auth, provider)
    const user = userCredential.user

    // Check if user document exists, create if not
    const userDoc = await getDoc(doc(db, 'users', user.uid))
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
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
  try {
    await signOut(auth)
  } catch (error: any) {
    const authError: AuthErrorWithCode = new Error(error.message || 'Sign out failed')
    authError.code = error.code
    throw authError
  }
}

// Reset password
export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email)
  } catch (error: any) {
    const authError: AuthErrorWithCode = new Error(error.message || 'Password reset failed')
    authError.code = error.code
    throw authError
  }
}

// Send email verification
export async function sendVerificationEmail(): Promise<void> {
  const user = auth.currentUser
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
