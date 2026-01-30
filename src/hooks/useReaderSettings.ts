'use client'

import { useState, useEffect } from 'react'

export type ReaderTheme = 'light' | 'dark'

export interface ReaderSettings {
    fontSize: number
    setFontSize: (size: number) => void
    fontFamily: string
    setFontFamily: (family: string) => void
    theme: ReaderTheme
    setTheme: (theme: ReaderTheme) => void
    showSettings: boolean
    setShowSettings: (show: boolean) => void
}

/**
 * Custom hook to manage reader UI settings with localStorage persistence
 * Handles: font size, font family, theme, and settings panel visibility
 */
export function useReaderSettings(): ReaderSettings {
    // Initialize font size from localStorage
    const [fontSize, setFontSizeState] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('reader-font-size')
            return saved ? parseInt(saved, 10) : 18
        }
        return 18
    })

    // Initialize font family from localStorage
    const [fontFamily, setFontFamilyState] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('reader-font-family')
            return saved || 'Georgia, serif'
        }
        return 'Georgia, serif'
    })

    // Initialize theme from localStorage
    const [theme, setThemeState] = useState<ReaderTheme>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('reader-theme') as ReaderTheme | null
            return saved || 'light'
        }
        return 'light'
    })

    const [showSettings, setShowSettings] = useState(false)

    // Persist font size to localStorage
    const setFontSize = (size: number) => {
        setFontSizeState(size)
        if (typeof window !== 'undefined') {
            localStorage.setItem('reader-font-size', size.toString())
        }
    }

    // Persist font family to localStorage
    const setFontFamily = (family: string) => {
        setFontFamilyState(family)
        if (typeof window !== 'undefined') {
            localStorage.setItem('reader-font-family', family)
        }
    }

    // Persist theme to localStorage and update document class
    const setTheme = (newTheme: ReaderTheme) => {
        setThemeState(newTheme)
        if (typeof window !== 'undefined') {
            localStorage.setItem('reader-theme', newTheme)
            document.documentElement.classList.toggle('dark', newTheme === 'dark')
        }
    }

    // Apply theme class on mount
    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
    }, [theme])

    return {
        fontSize,
        setFontSize,
        fontFamily,
        setFontFamily,
        theme,
        setTheme,
        showSettings,
        setShowSettings,
    }
}
