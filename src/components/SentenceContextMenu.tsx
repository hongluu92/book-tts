'use client'

import { useEffect, useRef } from 'react'
import { BookOpen, Highlighter } from 'lucide-react'

interface SentenceContextMenuProps {
    position: { x: number; y: number }
    sentenceText: string
    onReadFromHere: () => void
    onHighlight: () => void
    isHighlighted: boolean
    onClose: () => void
}

export default function SentenceContextMenu({
    position,
    sentenceText,
    onReadFromHere,
    onHighlight,
    isHighlighted,
    onClose,
}: SentenceContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null)

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose()
            }
        }

        // Close on Escape key
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [onClose])

    // Adjust position to keep menu within viewport
    const adjustedPosition = {
        x: Math.min(position.x, window.innerWidth - 220), // 220px menu width
        y: Math.min(position.y, window.innerHeight - 120), // 120px menu height
    }

    return (
        <div
            ref={menuRef}
            className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 min-w-[200px]"
            style={{
                left: `${adjustedPosition.x}px`,
                top: `${adjustedPosition.y}px`,
            }}
        >
            <button
                onClick={() => {
                    onReadFromHere()
                    onClose()
                }}
                className="w-full px-4 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-3 text-sm text-gray-900 dark:text-white transition-colors"
            >
                <BookOpen className="h-4 w-4 stroke-[2]" />
                <span>Đọc từ câu này</span>
            </button>
            <button
                onClick={() => {
                    onHighlight()
                    onClose()
                }}
                className="w-full px-4 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-3 text-sm text-gray-900 dark:text-white transition-colors"
            >
                <Highlighter className="h-4 w-4 stroke-[2]" />
                <span>{isHighlighted ? 'Xoá Highlight' : 'Highlight'}</span>
            </button>
        </div>
    )
}
