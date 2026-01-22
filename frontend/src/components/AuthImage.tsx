'use client'

import { useState, useEffect } from 'react'

interface AuthImageProps {
  src: string
  alt: string
  className?: string
  fallback?: React.ReactNode
}

export default function AuthImage({ src, alt, className, fallback }: AuthImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!src) {
      setError(true)
      return
    }

    let currentBlobUrl: string | null = null

    const loadImage = async () => {
      try {
        const token = localStorage.getItem('accessToken')
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
        
        // src may already include /api prefix, so check and handle accordingly
        let imageUrl: string;
        if (src.startsWith('/api/')) {
          // src already has /api prefix, use it directly with base URL
          const baseUrl = API_URL.replace(/\/api$/, '') // Remove /api suffix if present
          imageUrl = `${baseUrl}${src}`
        } else if (src.startsWith('http://') || src.startsWith('https://')) {
          // Full URL, use as-is
          imageUrl = src
        } else {
          // Relative path, prepend API_URL
          imageUrl = `${API_URL}${src}`
        }
        
        const response = await fetch(imageUrl, {
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        })

        if (!response.ok) {
          throw new Error('Failed to load image')
        }

        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        currentBlobUrl = blobUrl
        setImageSrc(blobUrl)
      } catch (err) {
        console.error('Error loading image:', err)
        setError(true)
      }
    }

    loadImage()

    // Cleanup blob URL on unmount or src change
    return () => {
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl)
      }
    }
  }, [src])

  if (error || !imageSrc) {
    return fallback || null
  }

  return <img src={imageSrc} alt={alt} className={className} />
}
