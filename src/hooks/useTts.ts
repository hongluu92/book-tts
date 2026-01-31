'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { BrowserSpeechEngine } from '@/lib/tts/browser-speech-engine'
import { Sentence, TtsOptions } from '@/lib/tts/types'

interface UseTtsOptions {
  sentences: Sentence[]
  onSentenceStart?: (sentence: Sentence) => void
  onSentenceEnd?: (sentence: Sentence) => void
  onProgress?: (sentenceIndex: number) => void
  onChapterEnd?: () => void
}

export function useTts(options: UseTtsOptions) {
  const { sentences, onSentenceStart, onSentenceEnd, onProgress, onChapterEnd } = options

  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [rate, setRate] = useState(1.0)
  const [voicesLoading, setVoicesLoading] = useState(true)

  const engineRef = useRef<BrowserSpeechEngine | null>(null)
  const isPlayingRef = useRef(false)
  const prevRateRef = useRef(1.0)
  const isRestartingRef = useRef(false)
  const isResumingRef = useRef(false)

  const loadAndSelectVoice = useCallback(async () => {
    if (!engineRef.current || !engineRef.current.isSupported()) {
      setVoicesLoading(false)
      return
    }

    try {
      const loadedVoices = await engineRef.current.getVoices()

      setVoices(loadedVoices)
      setVoicesLoading(false)

      if (!selectedVoice && loadedVoices.length > 0) {
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
      loadAndSelectVoice()

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const handleVoicesChanged = () => {
          loadAndSelectVoice()
        }

        speechSynthesis.onvoiceschanged = handleVoicesChanged

        return () => {
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
    async (index: number, isRetry: boolean = false) => {
      if (!engineRef.current || index < 0 || index >= sentences.length) {
        return
      }

      const sentence = sentences[index]
      if (!sentence) return

      // Track whether speech actually started for this sentence
      let speechStarted = false
      let startTimeout: NodeJS.Timeout | null = null

      const ttsOptions: TtsOptions = {
        voice: selectedVoice || undefined,
        rate,
        onStart: () => {
          speechStarted = true
          if (startTimeout) {
            clearTimeout(startTimeout)
            startTimeout = null
          }
          
          // Only update currentSentenceIndex when speech actually starts
          // This ensures highlight only appears when sentence is actually being read
          setCurrentSentenceIndex(index)
          onProgress?.(index)
          
          setIsPlaying(true)
          setIsPaused(false)
          isPlayingRef.current = true
          isRestartingRef.current = false
          isResumingRef.current = false
          onSentenceStart?.(sentence)
        },
        onEnd: () => {
          if (startTimeout) {
            clearTimeout(startTimeout)
            startTimeout = null
          }

          if (isResumingRef.current || isRestartingRef.current) {
            return
          }

          // Only call onSentenceEnd if speech actually started
          if (speechStarted) {
            onSentenceEnd?.(sentence)
          }

          // Auto-play next sentence if still playing AND speech started
          if (isPlayingRef.current && speechStarted && index < sentences.length - 1) {
            playSentence(index + 1).catch((err) => {
              console.error('Failed to play next sentence:', err)
            })
          } else {
            setIsPlaying(false)
            isPlayingRef.current = false
            if (speechStarted && index === sentences.length - 1) {
              onChapterEnd?.()
            }
          }
        },
        onError: (error) => {
          if (startTimeout) {
            clearTimeout(startTimeout)
            startTimeout = null
          }

          if (isResumingRef.current) return

          if (!error.message.includes('interrupted') && !error.message.includes('canceled')) {
            console.error('TTS error:', error)
          }
          
          // If speech never started, try to continue to next sentence
          if (!speechStarted && isPlayingRef.current && index < sentences.length - 1) {
            console.warn('[useTts] Speech did not start for sentence', index, ', trying next sentence')
            playSentence(index + 1).catch((err) => {
              console.error('Failed to play next sentence after error:', err)
            })
          } else {
            setIsPlaying(false)
            isPlayingRef.current = false
          }
        },
      }

      try {
        // Check if text is empty or too short
        const textToSpeak = sentence.text.trim()
        if (!textToSpeak || textToSpeak.length === 0) {
          console.warn('[useTts] Empty sentence text, skipping:', index)
          // Skip empty sentences and continue to next
          if (isPlayingRef.current && index < sentences.length - 1) {
            // Small delay before playing next to avoid rapid fire
            setTimeout(() => {
              playSentence(index + 1).catch((err) => {
                console.error('Failed to play next sentence after empty:', err)
              })
            }, 100)
          } else {
            setIsPlaying(false)
            isPlayingRef.current = false
            if (index === sentences.length - 1) {
              onChapterEnd?.()
            }
          }
          return
        }

        // Enforce explicit cancel before speaking to prevent duplicates/queueing
        // This ensures "last command wins" behavior
        engineRef.current.cancel()

        // Small delay after cancel to ensure it's processed (especially on Windows)
        // This prevents race condition where speak() is called before cancel() completes
        await new Promise(resolve => setTimeout(resolve, 50))

        // Set a timeout to detect if speech doesn't start within reasonable time
        // This handles cases where onStart never fires (browser bugs, etc.)
        startTimeout = setTimeout(() => {
          if (!speechStarted && isPlayingRef.current) {
            if (!isRetry) {
              // First attempt failed, retry once
              console.warn('[useTts] Speech did not start within 2 seconds for sentence', index, 'text:', textToSpeak.substring(0, 50))
              console.log('[useTts] Retrying sentence', index)
              // Cancel and retry
              if (engineRef.current) {
                engineRef.current.cancel()
                setTimeout(() => {
                  if (isPlayingRef.current && !speechStarted) {
                    playSentence(index, true).catch((err) => {
                      console.error('Failed to retry sentence:', err)
                      // If retry fails, try next sentence
                      if (index < sentences.length - 1) {
                        playSentence(index + 1, false).catch((err2) => {
                          console.error('Failed to play next sentence after retry failure:', err2)
                          setIsPlaying(false)
                          isPlayingRef.current = false
                        })
                      } else {
                        setIsPlaying(false)
                        isPlayingRef.current = false
                      }
                    })
                  }
                }, 100)
              }
            } else {
              // Retry also failed, skip to next sentence
              console.warn('[useTts] Retry also failed for sentence', index, ', skipping to next')
              if (index < sentences.length - 1) {
                playSentence(index + 1, false).catch((err) => {
                  console.error('Failed to play next sentence after retry failure:', err)
                  setIsPlaying(false)
                  isPlayingRef.current = false
                })
              } else {
                setIsPlaying(false)
                isPlayingRef.current = false
              }
            }
          }
        }, 2000) as unknown as NodeJS.Timeout

        engineRef.current.speak(textToSpeak, ttsOptions).catch((error) => {
          if (startTimeout) {
            clearTimeout(startTimeout)
            startTimeout = null
          }
          console.error('Failed to speak:', error)
          // Retry once on error if not already retried
          if (!speechStarted && isPlayingRef.current && !isRetry) {
            console.log('[useTts] Retrying sentence after error:', index)
            setTimeout(() => {
              if (isPlayingRef.current && !speechStarted) {
                playSentence(index, true).catch((err) => {
                  console.error('Failed to retry sentence after error:', err)
                  setIsPlaying(false)
                  isPlayingRef.current = false
                })
              }
            }, 200)
          } else {
            setIsPlaying(false)
            isPlayingRef.current = false
          }
        })
      } catch (error) {
        if (startTimeout) {
          clearTimeout(startTimeout)
          startTimeout = null
        }
        console.error('Failed to speak:', error)
        // Retry once on exception if not already retried
        if (!speechStarted && isPlayingRef.current && !isRetry) {
          console.log('[useTts] Retrying sentence after exception:', index)
          setTimeout(() => {
            if (isPlayingRef.current && !speechStarted) {
              playSentence(index, true).catch((err) => {
                console.error('Failed to retry sentence after exception:', err)
                setIsPlaying(false)
                isPlayingRef.current = false
              })
            }
          }, 200)
        } else {
          setIsPlaying(false)
          isPlayingRef.current = false
        }
      }
    },
    [sentences, selectedVoice, rate, onSentenceStart, onSentenceEnd, onProgress],
  )

  const play = useCallback(() => {
    if (!engineRef.current) return

    if (voices.length === 0 && !voicesLoading) {
      loadAndSelectVoice()
    }

    if (isPaused) {
      // Mobile browsers (and some desktop ones) are unreliable with resume()
      // So we always cancel and restart the current sentence which is consistent everywhere
      // This ensures: "Pause rồi Play lại đọc lại câu vừa đọc" behavior
      // currentSentenceIndex is preserved during pause, so restarting it will read the same sentence
      console.log('[useTts] Resuming by restarting current sentence', currentSentenceIndex)
      isResumingRef.current = true
      engineRef.current.cancel()

      // Short delay to ensure cancel processed
      setIsPaused(false)
      isPlayingRef.current = true
      // Restart from the same sentence index (ensures no index drift)
      playSentence(currentSentenceIndex)
    } else {
      isPlayingRef.current = true
      playSentence(currentSentenceIndex)
    }
  }, [isPaused, currentSentenceIndex, playSentence, voices.length, voicesLoading, loadAndSelectVoice])

  const pause = useCallback(() => {
    if (engineRef.current) {
      // Pause speech without changing currentSentenceIndex
      // This allows play() to restart from the same sentence when resumed
      engineRef.current.pause()
      setIsPaused(true)
      // Note: currentSentenceIndex is preserved, ensuring no index drift
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
      const wasPlaying = isPlayingRef.current
      stop()
      setCurrentSentenceIndex(index)
      if (wasPlaying) {
        isPlayingRef.current = true
        playSentence(index)
      }
    },
    [stop, playSentence],
  )

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

  const prevSentencesRef = useRef<Sentence[]>([])

  useEffect(() => {
    const sentencesChanged = prevSentencesRef.current !== sentences

    if (sentencesChanged) {
      stop()
      setCurrentSentenceIndex(0)
      setIsPlaying(false)
      setIsPaused(false)
      isPlayingRef.current = false
      prevSentencesRef.current = sentences
    } else if (sentences.length > 0 && currentSentenceIndex >= sentences.length) {
      setCurrentSentenceIndex(0)
    }
  }, [sentences, currentSentenceIndex, stop])

  useEffect(() => {
    if (prevRateRef.current === rate) return

    if (isPlayingRef.current && !isPaused && engineRef.current && sentences.length > 0) {
      const currentIndex = currentSentenceIndex
      isRestartingRef.current = true
      engineRef.current.cancel()

      if (isPlayingRef.current && currentIndex >= 0 && currentIndex < sentences.length) {
        playSentence(currentIndex)
      } else {
        isRestartingRef.current = false
      }
    }

    prevRateRef.current = rate
  }, [rate, isPaused, currentSentenceIndex, sentences.length, playSentence])

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
    setSentenceIndex,
    prev,
    next,
    isSupported: engineRef.current?.isSupported() ?? false,
  }
}
