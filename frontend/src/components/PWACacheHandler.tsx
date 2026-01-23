'use client'

import { useEffect } from 'react'

/**
 * Component to handle PWA cache issues, especially digest errors on mobile
 * This component helps clear stale caches and handle build manifest errors
 */
export default function PWACacheHandler() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    const handleDigestError = async () => {
      try {
        // Check for service worker registrations
        const registrations = await navigator.serviceWorker.getRegistrations()
        
        // If there are registrations, check for errors
        if (registrations.length > 0) {
          // Listen for errors that might indicate digest issues
          window.addEventListener('error', (event) => {
            const errorMessage = event.message || ''
            if (
              errorMessage.includes('digest') ||
              errorMessage.includes('build-manifest') ||
              errorMessage.includes('fallback-build-manifest')
            ) {
              console.warn('[PWA] Detected digest error, clearing caches...')
              // Clear all caches
              if ('caches' in window) {
                caches.keys().then((keys) => {
                  keys.forEach((key) => caches.delete(key))
                })
              }
              // Unregister service workers
              registrations.forEach((reg) => reg.unregister())
              // Reload after a short delay
              setTimeout(() => {
                window.location.reload()
              }, 1000)
            }
          })
        }
      } catch (error) {
        // Silently handle errors
        console.warn('[PWA] Error in cache handler:', error)
      }
    }

    handleDigestError()
  }, [])

  return null
}
