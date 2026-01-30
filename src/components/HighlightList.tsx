'use client'

import { useEffect, useState, useMemo } from 'react'
import { X, Calendar, Bookmark } from 'lucide-react'
import { db, SentenceHighlight, V2Chapter } from '@/storage/db'
import { Button } from '@/components/ui/button'

interface HighlightListProps {
    bookFingerprint: string
    chapters: V2Chapter[]
    isOpen: boolean
    onClose: () => void
    onNavigate: (chapterId: string, sentenceIndex: number) => void
}

interface GroupedHighlights {
    chapterId: string
    chapterTitle: string
    items: SentenceHighlight[]
}

export default function HighlightList({
    bookFingerprint,
    chapters,
    isOpen,
    onClose,
    onNavigate,
}: HighlightListProps) {
    const [highlights, setHighlights] = useState<SentenceHighlight[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (isOpen) {
            setLoading(true)
            db.sentenceHighlights
                .where('bookFingerprint')
                .equals(bookFingerprint)
                .reverse()
                .sortBy('createdAtMs')
                .then((items) => {
                    setHighlights(items)
                })
                .finally(() => {
                    setLoading(false)
                })
        }
    }, [isOpen, bookFingerprint])

    // Group highlights by chapter
    const groupedHighlights = useMemo(() => {
        const groups: Record<string, SentenceHighlight[]> = {}

        // Sort by checking spine index order
        // Create a map of chapterId -> title
        const chapterMap = new Map<string, { title: string; index: number }>()
        chapters.forEach((c) => {
            chapterMap.set(c.chapterId, { title: c.title || `Chapter ${c.spineIndex + 1}`, index: c.spineIndex })
        })

        highlights.forEach((h) => {
            if (!groups[h.chapterId]) {
                groups[h.chapterId] = []
            }
            groups[h.chapterId].push(h)
        })

        return Object.entries(groups)
            .map(([chapterId, items]) => ({
                chapterId,
                chapterTitle: chapterMap.get(chapterId)?.title || 'Unknown Chapter',
                spineIndex: chapterMap.get(chapterId)?.index ?? -1,
                items: items.sort((a, b) => a.sentenceIndex - b.sentenceIndex),
            }))
            .sort((a, b) => a.spineIndex - b.spineIndex)
    }, [highlights, chapters])

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Sidebar - animate in would be better with framer-motion or css transitions but keeping it simple for now */}
            <div className="relative w-full max-w-md h-full bg-background border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        <Bookmark className="w-5 h-5 text-primary" />
                        <h2 className="font-semibold text-lg">Highlights</h2>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {highlights.length}
                        </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {loading ? (
                        <div className="text-center py-10 text-muted-foreground">Loading highlights...</div>
                    ) : highlights.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-2">
                            <Bookmark className="w-12 h-12 stroke-1 opacity-20" />
                            <p>No highlights yet</p>
                            <p className="text-sm">Long press directly on text to add some.</p>
                        </div>
                    ) : (
                        groupedHighlights.map((group) => (
                            <div key={group.chapterId} className="space-y-3">
                                <h3 className="text-sm font-medium text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-2 border-b">
                                    {group.chapterTitle}
                                </h3>
                                <div className="space-y-2">
                                    {group.items.map((highlight) => (
                                        <div
                                            key={highlight.id}
                                            onClick={() => {
                                                onNavigate(highlight.chapterId, highlight.sentenceIndex)
                                                onClose()
                                            }}
                                            className="group p-3 rounded-lg border bg-card hover:bg-accent/50 hover:border-accent-foreground/20 cursor-pointer transition-all active:scale-[0.98]"
                                        >
                                            <p className="text-sm leading-relaxed line-clamp-4 relative">
                                                <span className="absolute -left-2 top-0 bottom-0 w-1 bg-yellow-400/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                                "{highlight.text}"
                                            </p>
                                            <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                                                <Calendar className="w-3 h-3" />
                                                <span>{new Date(highlight.createdAtMs).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
