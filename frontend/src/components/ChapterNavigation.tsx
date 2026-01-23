'use client'

import React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { V2Chapter } from '@/storage/db'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ChapterNavigationProps {
  chapters: V2Chapter[]
  currentChapterIndex: number
  onChapterChange: (index: number) => void
  onStop: () => void
}

export default function ChapterNavigation({
  chapters,
  currentChapterIndex,
  onChapterChange,
  onStop,
}: ChapterNavigationProps) {
  const [chapterSearchOpen, setChapterSearchOpen] = React.useState(false)
  const [chapterSearchQuery, setChapterSearchQuery] = React.useState('')

  const filteredChapters = React.useMemo(() => {
    if (!chapters.length) return []
    if (!chapterSearchQuery.trim()) return chapters
    const query = chapterSearchQuery.toLowerCase()
    return chapters.filter((chapter, index) => {
      const chapterNum = `chương ${index + 1}`.toLowerCase()
      const title = chapter.title?.toLowerCase().trim() || ''
      return chapterNum.includes(query) || title.includes(query)
    })
  }, [chapters, chapterSearchQuery])

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          onStop()
          const newIndex = Math.max(0, currentChapterIndex - 1)
          onChapterChange(newIndex)
        }}
        disabled={currentChapterIndex === 0}
        className="h-9 w-9"
      >
        <ChevronLeft className="h-4 w-4 stroke-[2]" />
      </Button>

      <DropdownMenu
        open={chapterSearchOpen}
        onOpenChange={(open) => {
          setChapterSearchOpen(open)
          if (!open) setChapterSearchQuery('')
        }}
      >
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-w-[140px] justify-between gap-2')}
        >
          <span className="text-sm truncate">
            Chương {currentChapterIndex + 1} / {chapters.length}
          </span>
          <ChevronDown className="h-4 w-4 stroke-[2] opacity-50 flex-shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" className="w-[320px] p-0 max-h-[60vh]">
          <div className="p-2 border-b sticky top-0 bg-background z-10" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Tìm kiếm chương..."
                value={chapterSearchQuery}
                onChange={(e) => setChapterSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[calc(60vh-60px)]">
            {filteredChapters.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">Không tìm thấy chương</div>
            ) : (
              filteredChapters.map((chapter) => {
                const index = chapters.findIndex((ch) => ch.id === chapter.id)
                return (
                  <DropdownMenuItem
                    key={chapter.id}
                    onSelect={() => {
                      onStop()
                      onChapterChange(index)
                      setChapterSearchOpen(false)
                      setChapterSearchQuery('')
                    }}
                    className={cn('cursor-pointer px-3 py-2', index === currentChapterIndex && 'bg-accent')}
                  >
                    <div className="flex flex-col gap-0.5 w-full min-w-0">
                      <span className="font-medium text-sm truncate">Chương {index + 1}</span>
                      {chapter.title && (
                        <span className="text-xs text-muted-foreground line-clamp-1 truncate">
                          {chapter.title.trim()}
                        </span>
                      )}
                    </div>
                  </DropdownMenuItem>
                )
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          onStop()
          const newIndex = Math.min(chapters.length - 1, currentChapterIndex + 1)
          onChapterChange(newIndex)
        }}
        disabled={currentChapterIndex === chapters.length - 1}
        className="h-9 w-9"
      >
        <ChevronRight className="h-4 w-4 stroke-[2]" />
      </Button>
    </div>
  )
}
