'use client'

import { PlayIcon, PauseIcon, ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/solid'

interface TtsControlsProps {
  isPlaying: boolean
  isPaused: boolean
  rate: number
  voices: SpeechSynthesisVoice[]
  selectedVoice: SpeechSynthesisVoice | null
  voicesLoading: boolean
  currentSentenceIndex: number
  totalSentences: number
  onPlay: () => void
  onPause: () => void
  onPrev: () => void
  onNext: () => void
  onRateChange: (rate: number) => void
  onVoiceChange: (voice: SpeechSynthesisVoice | null) => void
  isSupported: boolean
  loading?: boolean
  error?: string | null
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
  onPlay,
  onPause,
  onPrev,
  onNext,
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
      <div className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          TTS is not supported in this browser
        </div>
      </div>
    )
  }

  const hasSentences = totalSentences > 0
  const isDisabled = loading || !!error || !hasSentences

  return (
    <div className="px-4 py-3 safe-area-bottom">
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Loading or Error Message */}
        {loading && (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400">
            Loading sentences...
          </div>
        )}
        {error && !loading && (
          <div className="text-center space-y-2">
            <div className="text-sm text-red-500 dark:text-red-400">
              {error}
            </div>
            {onReprocess && error.includes('re-process') && (
              <button
                onClick={onReprocess}
                disabled={reprocessing}
                className="mt-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reprocessing ? 'Re-processing...' : 'Re-process Book'}
              </button>
            )}
          </div>
        )}
        {!loading && !error && !hasSentences && (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400">
            No sentences available for this chapter
          </div>
        )}

        {/* Main Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onPrev}
            disabled={isDisabled || currentSentenceIndex === 0}
            className="p-2 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Previous sentence"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>

          <button
            onClick={isPlaying && !isPaused ? onPause : onPlay}
            disabled={isDisabled}
            className="p-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={isPlaying && !isPaused ? 'Pause' : 'Play'}
          >
            {isPlaying && !isPaused ? (
              <PauseIcon className="h-6 w-6" />
            ) : (
              <PlayIcon className="h-6 w-6" />
            )}
          </button>

          <button
            onClick={onNext}
            disabled={isDisabled || currentSentenceIndex >= totalSentences - 1}
            className="p-2 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Next sentence"
          >
            <ArrowRightIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Rate and Voice Controls */}
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400">Rate:</label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => onRateChange(parseFloat(e.target.value))}
              disabled={isDisabled}
              className="w-24 disabled:opacity-50"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400 w-12">
              {rate.toFixed(1)}x
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400">Voice:</label>
            {voicesLoading ? (
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
            ) : (
              <select
                value={selectedVoice?.name || ''}
                onChange={(e) => {
                  const voice = voices.find((v) => v.name === e.target.value) || null
                  onVoiceChange(voice)
                }}
                disabled={isDisabled}
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white disabled:opacity-50"
              >
                {voices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.lang} - {voice.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Progress Indicator */}
        {hasSentences && (
          <div className="text-center text-xs text-gray-500 dark:text-gray-400">
            Sentence {currentSentenceIndex + 1} / {totalSentences}
          </div>
        )}
      </div>
    </div>
  )
}
