'use client'

import { useState, useMemo } from 'react'
import { Play, Pause, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface TtsControlsProps {
  isPlaying: boolean
  isPaused: boolean
  rate: number
  voices: SpeechSynthesisVoice[]
  selectedVoice: SpeechSynthesisVoice | null
  voicesLoading: boolean
  currentSentenceIndex: number
  totalSentences: number
  currentChapterIndex: number
  totalChapters: number
  onPlay: () => void
  onPause: () => void
  onPrev: () => void
  onNext: () => void
  onPrevChapter: () => void
  onNextChapter: () => void
  onRateChange: (rate: number) => void
  onVoiceChange: (voice: SpeechSynthesisVoice | null) => void
  isSupported: boolean
  loading?: boolean
  error?: string | null
  onReprocess?: () => void
  reprocessing?: boolean
}

export default function TtsControls({
  isPlaying,
  isPaused,
  rate,
  voices,
  selectedVoice,
  voicesLoading,
  currentSentenceIndex,
  totalSentences,
  currentChapterIndex,
  totalChapters,
  onPlay,
  onPause,
  onPrev,
  onNext,
  onPrevChapter,
  onNextChapter,
  onRateChange,
  onVoiceChange,
  isSupported,
  loading = false,
  error = null,
  onReprocess,
  reprocessing = false,
}: TtsControlsProps) {
  if (!isSupported) {
    return (
      <div className="px-4 py-3 safe-area-bottom bg-background border-t border-border">
        <div className="text-center text-sm text-muted-foreground">
          TTS không được hỗ trợ trên trình duyệt này
        </div>
      </div>
    )
  }

  const hasSentences = totalSentences > 0
  const isDisabled = loading || !!error || !hasSentences

  const rateOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
  
  // Voice search state
  const [voiceSearchOpen, setVoiceSearchOpen] = useState(false)
  const [voiceSearchQuery, setVoiceSearchQuery] = useState('')
  
  // Filter voices based on search
  const filteredVoices = useMemo(() => {
    if (!voiceSearchQuery.trim()) return voices
    const query = voiceSearchQuery.toLowerCase()
    return voices.filter(
      (voice) =>
        voice.name.toLowerCase().includes(query) ||
        voice.lang.toLowerCase().includes(query)
    )
  }, [voices, voiceSearchQuery])

  return (
    <div className="px-4 py-3 safe-area-bottom bg-background border-t border-border">
      <div className="max-w-6xl mx-auto">
        {/* Loading or Error Message */}
        {loading && (
          <div className="text-center text-sm text-muted-foreground py-2">
            Đang tải...
          </div>
        )}
        {error && !loading && (
          <div className="text-center space-y-2 py-2">
            <div className="text-sm text-destructive">
              {error}
            </div>
            {onReprocess && error.includes('re-process') && (
              <Button
                onClick={onReprocess}
                disabled={reprocessing}
                size="sm"
                variant="outline"
              >
                {reprocessing ? 'Đang xử lý...' : 'Xử lý lại'}
              </Button>
            )}
          </div>
        )}
        {!loading && !error && !hasSentences && (
          <div className="text-center text-sm text-muted-foreground py-2">
            Không có câu nào cho chương này
          </div>
        )}

        {/* Main Controls - Play left, Settings right */}
        {!loading && !error && hasSentences && (
          <div className="flex items-center justify-between gap-4">
            {/* Left: Play button + Chapter navigation */}
            <div className="flex items-center gap-2">
              <Button
                onClick={onPrevChapter}
                disabled={isDisabled || currentChapterIndex === 0}
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Chương trước"
              >
                <ChevronLeft className="h-5 w-5 stroke-[2]" />
              </Button>

              <Button
                onClick={isPlaying && !isPaused ? onPause : onPlay}
                disabled={isDisabled}
                size="icon"
                className="h-10 w-10 rounded-full"
                aria-label={isPlaying && !isPaused ? 'Tạm dừng' : 'Phát'}
              >
                {isPlaying && !isPaused ? (
                  <Pause className="h-5 w-5 stroke-[2.5]" fill="currentColor" />
                ) : (
                  <Play className="h-5 w-5 stroke-[2.5] ml-0.5" fill="currentColor" />
                )}
              </Button>

              <Button
                onClick={onNextChapter}
                disabled={isDisabled || currentChapterIndex >= totalChapters - 1}
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Chương tiếp"
              >
                <ChevronRight className="h-5 w-5 stroke-[2]" />
              </Button>
            </div>

            {/* Right: Rate + Voice controls */}
            <div className="flex items-center gap-2">
              {/* Rate Dropdown - Opens upward */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={isDisabled}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-9 px-3 text-sm')}
                >
                  {rate.toFixed(2)}x
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top">
                  {rateOptions.map((option) => (
                    <DropdownMenuItem
                      key={option}
                      onSelect={() => {
                        if (option !== rate) {
                          onRateChange(option)
                        }
                      }}
                      className={cn(
                        "cursor-pointer",
                        rate === option && "bg-accent"
                      )}
                    >
                      {option.toFixed(2)}x
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Voice Select with Search */}
              {voicesLoading ? (
                <span className="text-xs text-muted-foreground px-2">Đang tải...</span>
              ) : (
                <DropdownMenu
                  open={voiceSearchOpen}
                  onOpenChange={(open) => {
                    setVoiceSearchOpen(open)
                    if (!open) {
                      setVoiceSearchQuery('')
                    }
                  }}
                >
                  <DropdownMenuTrigger
                    disabled={isDisabled}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'sm' }),
                      'h-9 px-3 text-sm min-w-[180px] max-w-[220px] justify-between',
                    )}
                  >
                    <span className="truncate">
                      {selectedVoice ? `${selectedVoice.lang.trim()} - ${selectedVoice.name.trim()}` : 'Chọn giọng đọc'}
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" className="w-[280px] p-0">
                    {/* Search input */}
                    <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Tìm kiếm giọng đọc..."
                          value={voiceSearchQuery}
                          onChange={(e) => setVoiceSearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                          autoFocus
                        />
                      </div>
                    </div>
                    {/* Voice list */}
                    <div className="max-h-[300px] overflow-y-auto">
                      {filteredVoices.length === 0 ? (
                        <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                          Không tìm thấy giọng đọc
                        </div>
                      ) : (
                        filteredVoices.map((voice) => (
                          <DropdownMenuItem
                            key={voice.name}
                            onSelect={() => {
                              onVoiceChange(voice)
                              setVoiceSearchOpen(false)
                              setVoiceSearchQuery('')
                            }}
                            className={cn(
                              "cursor-pointer",
                              selectedVoice?.name === voice.name && "bg-accent"
                            )}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium whitespace-normal break-words">{voice.name.trim()}</span>
                              <span className="text-xs text-muted-foreground whitespace-normal break-words">{voice.lang.trim()}</span>
                            </div>
                          </DropdownMenuItem>
                        ))
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
