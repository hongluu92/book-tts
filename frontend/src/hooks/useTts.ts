'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { BrowserSpeechEngine } from '@/lib/tts/browser-speech-engine'
import { Sentence, TtsOptions } from '@/lib/tts/types'

interface UseTtsOptions {
  sentences: Sentence[]
  onSentenceStart?: (sentence: Sentence) => void
  onSentenceEnd?: (sentence: Sentence) => void
  onProgress?: (sentenceIndex: number) => void
}

export function useTts(options: UseTtsOptions) {
  const { sentences, onSentenceStart, onSentenceEnd, onProgress } = options
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [rate, setRate] = useState(1.0)
  const [voicesLoading, setVoicesLoading] = useState(true)

  const engineRef = useRef<BrowserSpeechEngine | null>(null)
  const isPlayingRef = useRef(false)
  const prevRateRef = useRef(1.0) // Initialize with default rate
  const isRestartingRef = useRef(false) // Flag to prevent auto-play during rate change restart

  const loadAndSelectVoice = useCallback(async () => {
    if (!engineRef.current || !engineRef.current.isSupported()) {
      setVoicesLoading(false)
      return
    }

    try {
      const loadedVoices = await engineRef.current.getVoices()
      
      setVoices(loadedVoices)
      setVoicesLoading(false)
      
      // Only auto-select if no voice is currently selected
      if (!selectedVoice && loadedVoices.length > 0) {
        // Auto-select Vietnamese voice if available
        // Try multiple strategies to find Vietnamese voice
        const vietnameseVoice = loadedVoices.find((v) => {
          const lang = v.lang.toLowerCase()
          const name = v.name.toLowerCase()
          return (
            lang.startsWith('vi') ||
            lang.includes('vietnamese') ||
            name.includes('vietnamese') ||
            name.includes('vi-') ||
            name.includes('viet')
          )
        })
        
        if (vietnameseVoice) {
          setSelectedVoice(vietnameseVoice)
        } else {
          // Fallback: try to find a voice with Vietnamese-like characteristics
          // or just use the first available voice
          const defaultVoice = loadedVoices.find((v) => v.default) || loadedVoices[0]
          setSelectedVoice(defaultVoice)
        }
      }
    } catch (error) {
      console.error('[useTts] Error loading voices:', error)
      setVoicesLoading(false)
    }
  }, [selectedVoice])

  useEffect(() => {
    engineRef.current = new BrowserSpeechEngine()
    
    if (engineRef.current.isSupported()) {
      // Initial load
      loadAndSelectVoice()
      
      // Listen for voices changed event (some browsers load voices asynchronously)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const handleVoicesChanged = () => {
          loadAndSelectVoice()
        }
        
        speechSynthesis.onvoiceschanged = handleVoicesChanged
        
        return () => {
          // Cleanup: stop TTS and remove event listener
          if (engineRef.current) {
            engineRef.current.cancel()
            setIsPlaying(false)
            setIsPaused(false)
            isPlayingRef.current = false
          }
          
          if (speechSynthesis.onvoiceschanged === handleVoicesChanged) {
            speechSynthesis.onvoiceschanged = null
          }
        }
      } else {
        // Cleanup even if not supported
        return () => {
          if (engineRef.current) {
            engineRef.current.cancel()
            setIsPlaying(false)
            setIsPaused(false)
            isPlayingRef.current = false
          }
        }
      }
    } else {
      setVoicesLoading(false)
    }
  }, [loadAndSelectVoice])

  const playSentence = useCallback(
    async (index: number) => {
      if (!engineRef.current || index < 0 || index >= sentences.length) {
        return
      }

      const sentence = sentences[index]
      if (!sentence) return

      setCurrentSentenceIndex(index)
      onProgress?.(index)

      const ttsOptions: TtsOptions = {
        voice: selectedVoice || undefined,
        rate,
        onStart: () => {
          setIsPlaying(true)
          setIsPaused(false)
          isPlayingRef.current = true
          // Clear restart flag when new utterance starts
          isRestartingRef.current = false
          onSentenceStart?.(sentence)
        },
        onEnd: () => {
          onSentenceEnd?.(sentence)
          
          // Don't auto-play next if we're restarting due to rate change
          // The flag will be cleared in onStart of the new utterance
          if (isRestartingRef.current) {
            return
          }
          
          // Auto-play next sentence if still playing
          if (isPlayingRef.current && index < sentences.length - 1) {
            playSentence(index + 1)
          } else {
            setIsPlaying(false)
            isPlayingRef.current = false
          }
        },
        onError: (error) => {
          // Only log non-interrupted errors
          if (!error.message.includes('interrupted') && !error.message.includes('canceled')) {
            console.error('TTS error:', error)
          }
          setIsPlaying(false)
          isPlayingRef.current = false
        },
      }

      try {
        await engineRef.current.speak(sentence.text, ttsOptions)
      } catch (error) {
        console.error('Failed to speak:', error)
        setIsPlaying(false)
        isPlayingRef.current = false
      }
    },
    [sentences, selectedVoice, rate, onSentenceStart, onSentenceEnd, onProgress],
  )

  const play = useCallback(() => {
    if (!engineRef.current) return

    // Reload voices on first play (iOS requirement - voices only load after user interaction)
    if (voices.length === 0 && !voicesLoading) {
      loadAndSelectVoice()
    }

    if (isPaused) {
      engineRef.current.resume()
      setIsPaused(false)
    } else {
      isPlayingRef.current = true
      playSentence(currentSentenceIndex)
    }
  }, [isPaused, currentSentenceIndex, playSentence, voices.length, voicesLoading, loadAndSelectVoice])

  const pause = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.pause()
      setIsPaused(true)
    }
  }, [])

  const stop = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.cancel()
      setIsPlaying(false)
      setIsPaused(false)
      isPlayingRef.current = false
    }
  }, [])

  const seek = useCallback(
    (index: number) => {
      stop()
      setCurrentSentenceIndex(index)
      if (isPlayingRef.current) {
        playSentence(index)
      }
    },
    [stop, playSentence],
  )

  // Seek to a sentence and immediately start playing from there.
  // This is used for UX like double-click-to-read-from-here.
  const playFrom = useCallback(
    (index: number) => {
      if (index < 0 || index >= sentences.length) return
      stop()
      setCurrentSentenceIndex(index)
      isPlayingRef.current = true
      playSentence(index)
    },
    [sentences.length, stop, playSentence],
  )

  const prev = useCallback(() => {
    if (currentSentenceIndex > 0) {
      seek(currentSentenceIndex - 1)
    }
  }, [currentSentenceIndex, seek])

  const next = useCallback(() => {
    if (currentSentenceIndex < sentences.length - 1) {
      seek(currentSentenceIndex + 1)
    }
  }, [currentSentenceIndex, sentences.length, seek])

  // Track previous sentences to detect chapter changes
  const prevSentencesRef = useRef<Sentence[]>([])

  // Reset TTS state when sentences change (new chapter loaded)
  useEffect(() => {
    // Check if sentences array reference changed (new chapter loaded)
    const sentencesChanged = prevSentencesRef.current !== sentences
    
    if (sentencesChanged) {
      // Stop any playing TTS
      stop()
      
      // Reset to beginning of new chapter (sentence 0)
      setCurrentSentenceIndex(0)
      setIsPlaying(false)
      setIsPaused(false)
      isPlayingRef.current = false
      
      // Update ref
      prevSentencesRef.current = sentences
    } else if (sentences.length > 0 && currentSentenceIndex >= sentences.length) {
      // Current index is out of bounds, reset to 0
      setCurrentSentenceIndex(0)
    }
  }, [sentences, currentSentenceIndex, stop])

  // Restart current sentence when rate changes while playing
  useEffect(() => {
    // Skip on initial mount
    if (prevRateRef.current === rate) return
    
    // If rate changed and TTS is currently playing (not paused), restart current sentence
    if (isPlayingRef.current && !isPaused && engineRef.current && sentences.length > 0) {
      const currentIndex = currentSentenceIndex
      
      // Set flag to prevent onEnd callback from auto-playing next sentence
      // Flag will be cleared in onStart of the new utterance
      isRestartingRef.current = true
      
      // Cancel current utterance
      engineRef.current.cancel()
      
      // Restart current sentence with new rate
      // Use a small delay to ensure cancellation is processed
      setTimeout(() => {
        if (isPlayingRef.current && currentIndex >= 0 && currentIndex < sentences.length) {
          playSentence(currentIndex)
        } else {
          // If not playing anymore, clear the flag
          isRestartingRef.current = false
        }
      }, 50)
    }
    
    // Update previous rate
    prevRateRef.current = rate
  }, [rate, isPaused, currentSentenceIndex, sentences.length, playSentence])

  // Expose setCurrentSentenceIndex for restoring position without playing
  const setSentenceIndex = useCallback((index: number) => {
    if (index >= 0 && index < sentences.length) {
      setCurrentSentenceIndex(index)
    }
  }, [sentences.length])

  return {
    isPlaying,
    isPaused,
    currentSentenceIndex,
    voices,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    voicesLoading,
    play,
    pause,
    stop,
    seek,
    playFrom,
    setSentenceIndex, // For restoring position without playing
    prev,
    next,
    isSupported: engineRef.current?.isSupported() ?? false,
  }
}
