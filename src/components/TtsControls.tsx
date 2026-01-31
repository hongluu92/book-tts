'use client'

import { useState, useMemo } from 'react'
import { Play, Pause, SkipBack, SkipForward, Search, Check, Download } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { PiperVoiceConfig } from '@/lib/tts/types'

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
  onSeek?: (index: number) => void
  isSupported: boolean
  loading?: boolean
  error?: string | null
  onReprocess?: () => void
  reprocessing?: boolean
  engineType?: 'browser' | 'piper-wasm'
  piperDownloading?: boolean
  downloadProgress?: { loaded: number; total: number } | null
  piperVoices?: PiperVoiceConfig[]
  piperStoredVoices?: string[]
  activePiperVoiceId?: string | null
  onPiperVoiceChange?: (voiceId: string) => void
  onDownloadPiperVoice?: (voiceId: string) => void
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
  onSeek,
  isSupported,
  loading = false,
  error = null,
  onReprocess,
  reprocessing = false,
  engineType = 'browser',
  piperDownloading = false,
  downloadProgress = null,
  piperVoices = [],
  piperStoredVoices = [],
  activePiperVoiceId = null,
  onPiperVoiceChange,
  onDownloadPiperVoice,
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

  // Progress calculations
  const sentencePercent = totalSentences > 0
    ? ((currentSentenceIndex + 1) / totalSentences) * 100
    : 0
  const downloadPercent = downloadProgress && downloadProgress.total > 0
    ? Math.round((downloadProgress.loaded / downloadProgress.total) * 100)
    : 0

  // Filter browser voices based on search
  const filteredBrowserVoices = useMemo(() => {
    if (!voiceSearchQuery.trim()) return voices
    const query = voiceSearchQuery.toLowerCase()
    return voices.filter(
      (voice) =>
        voice.name.toLowerCase().includes(query) ||
        voice.lang.toLowerCase().includes(query)
    )
  }, [voices, voiceSearchQuery])

  // Filter piper voices based on search
  const filteredPiperVoices = useMemo(() => {
    if (!voiceSearchQuery.trim()) return piperVoices
    const query = voiceSearchQuery.toLowerCase()
    return piperVoices.filter(
      (voice) =>
        voice.label.toLowerCase().includes(query) ||
        voice.lang.toLowerCase().includes(query)
    )
  }, [piperVoices, voiceSearchQuery])

  // Active voice display name
  const activeVoiceLabel = useMemo(() => {
    if (activePiperVoiceId) {
      const pv = piperVoices.find(v => v.voiceId === activePiperVoiceId)
      return pv?.label ?? 'Piper'
    }
    if (selectedVoice) {
      return selectedVoice.name.trim()
    }
    return 'Chọn giọng đọc'
  }, [activePiperVoiceId, piperVoices, selectedVoice])

  // Engine badge
  const engineBadge = useMemo(() => {
    if (piperDownloading) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          Loading
        </span>
      )
    }
    if (engineType === 'piper-wasm') {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
          Piper
        </span>
      )
    }
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
        Browser
      </span>
    )
  }, [engineType, piperDownloading])

  // Progress bar click to seek
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (piperDownloading || totalSentences === 0 || !onSeek) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const targetIndex = Math.round(percent * (totalSentences - 1))
    onSeek(targetIndex)
  }

  return (
    <div className="px-4 pt-2 pb-3 safe-area-bottom bg-background border-t border-border">
      <div className="max-w-6xl mx-auto space-y-2">
        {/* Loading or Error Message */}
        {loading && (
          <div className="text-center text-sm text-muted-foreground py-1">
            Đang tải...
          </div>
        )}
        {error && !loading && (
          <div className="text-center space-y-2 py-1">
            <div className="text-sm text-destructive">{error}</div>
            {onReprocess && error.includes('re-process') && (
              <Button onClick={onReprocess} disabled={reprocessing} size="sm" variant="outline">
                {reprocessing ? 'Đang xử lý...' : 'Xử lý lại'}
              </Button>
            )}
          </div>
        )}
        {!loading && !error && !hasSentences && (
          <div className="text-center text-sm text-muted-foreground py-1">
            Không có câu nào cho chương này
          </div>
        )}

        {/* Row 1: Progress bar + sentence counter */}
        {!loading && !error && hasSentences && (
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex-1 relative h-1.5 bg-muted rounded-full overflow-hidden",
                !piperDownloading && onSeek && "cursor-pointer"
              )}
              onClick={handleProgressClick}
            >
              {piperDownloading ? (
                <div
                  className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${downloadPercent}%` }}
                />
              ) : (
                <div
                  className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${sentencePercent}%` }}
                />
              )}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {piperDownloading
                ? `Tải voice... ${downloadPercent}%`
                : `${currentSentenceIndex + 1} / ${totalSentences}`}
            </span>
          </div>
        )}

        {/* Row 2: Playback controls */}
        {!loading && !error && hasSentences && (
          <div className="flex items-center justify-between">
            {/* Left: chapter nav + play */}
            <div className="flex items-center gap-1">
              <Button
                onClick={onPrevChapter}
                disabled={isDisabled || currentChapterIndex === 0}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Chương trước"
              >
                <SkipBack className="h-4 w-4 stroke-[2]" />
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
                className="h-8 w-8"
                aria-label="Chương tiếp"
              >
                <SkipForward className="h-4 w-4 stroke-[2]" />
              </Button>
            </div>

            {/* Right: rate + voice picker + engine badge */}
            <div className="flex items-center gap-1.5">
              {/* Rate Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={isDisabled}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8 px-2 text-xs tabular-nums')}
                >
                  {rate.toFixed(2)}x
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top">
                  {rateOptions.map((option) => (
                    <DropdownMenuItem
                      key={option}
                      onSelect={() => { if (option !== rate) onRateChange(option) }}
                      className={cn("cursor-pointer", rate === option && "bg-accent")}
                    >
                      {option.toFixed(2)}x
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Unified Voice Picker */}
              {voicesLoading ? (
                <span className="text-xs text-muted-foreground px-2">...</span>
              ) : (
                <DropdownMenu
                  open={voiceSearchOpen}
                  onOpenChange={(open) => {
                    setVoiceSearchOpen(open)
                    if (!open) setVoiceSearchQuery('')
                  }}
                >
                  <DropdownMenuTrigger
                    disabled={isDisabled}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'sm' }),
                      'h-8 px-2 text-xs max-w-[140px] sm:max-w-[200px] justify-between',
                    )}
                  >
                    <span className="truncate">{activeVoiceLabel}</span>
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

                    <div className="max-h-[300px] overflow-y-auto">
                      {/* Piper Voices Section */}
                      {filteredPiperVoices.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Piper Voices
                          </div>
                          {filteredPiperVoices.map((voice) => {
                            const isStored = piperStoredVoices.includes(voice.voiceId)
                            const isActive = activePiperVoiceId === voice.voiceId
                            return (
                              <DropdownMenuItem
                                key={voice.voiceId}
                                onSelect={() => {
                                  if (isStored && onPiperVoiceChange) {
                                    onPiperVoiceChange(voice.voiceId)
                                    setVoiceSearchOpen(false)
                                    setVoiceSearchQuery('')
                                  }
                                }}
                                className={cn("cursor-pointer", isActive && "bg-accent")}
                              >
                                <div className="flex items-center justify-between w-full gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {isActive ? (
                                      <Check className="h-3 w-3 shrink-0 text-primary" />
                                    ) : (
                                      <span className="w-3 shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <span className="font-medium text-sm">{voice.label}</span>
                                      <span className="text-xs text-muted-foreground ml-1.5">{voice.lang}</span>
                                    </div>
                                  </div>
                                  {isStored ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                                      Piper
                                    </span>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        onDownloadPiperVoice?.(voice.voiceId)
                                      }}
                                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 shrink-0"
                                    >
                                      <Download className="h-2.5 w-2.5" />
                                      Download
                                    </button>
                                  )}
                                </div>
                              </DropdownMenuItem>
                            )
                          })}
                        </>
                      )}

                      {/* Separator */}
                      {filteredPiperVoices.length > 0 && filteredBrowserVoices.length > 0 && (
                        <div className="h-px bg-border my-1" />
                      )}

                      {/* Browser Voices Section */}
                      {filteredBrowserVoices.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Browser Voices
                          </div>
                          {filteredBrowserVoices.map((voice) => (
                            <DropdownMenuItem
                              key={voice.name}
                              onSelect={() => {
                                onVoiceChange(voice)
                                setVoiceSearchOpen(false)
                                setVoiceSearchQuery('')
                              }}
                              className={cn(
                                "cursor-pointer",
                                !activePiperVoiceId && selectedVoice?.name === voice.name && "bg-accent"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {!activePiperVoiceId && selectedVoice?.name === voice.name ? (
                                  <Check className="h-3 w-3 shrink-0 text-primary" />
                                ) : (
                                  <span className="w-3 shrink-0" />
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="font-medium text-sm whitespace-normal break-words">{voice.name.trim()}</span>
                                  <span className="text-xs text-muted-foreground">{voice.lang.trim()}</span>
                                </div>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}

                      {filteredPiperVoices.length === 0 && filteredBrowserVoices.length === 0 && (
                        <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                          Không tìm thấy giọng đọc
                        </div>
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Engine badge */}
              {engineBadge}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
