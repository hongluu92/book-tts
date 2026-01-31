'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { BrowserSpeechEngine } from '@/lib/tts/browser-speech-engine'
import { TtsEngineManager } from '@/lib/tts/engine-manager'
import { Sentence, TtsOptions } from '@/lib/tts/types'

interface UseTtsOptions {
  sentences: Sentence[]
  onSentenceStart?: (sentence: Sentence) => void
  onSentenceEnd?: (sentence: Sentence) => void
  onProgress?: (sentenceIndex: number) => void
  onChapterEnd?: () => void
  engineManager?: TtsEngineManager | null
  detectedLang?: string
}

export function useTts(options: UseTtsOptions) {
  const { sentences, onSentenceStart, onSentenceEnd, onProgress, onChapterEnd, engineManager, detectedLang = 'vi' } = options

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
  const isPlayingSentenceRef = useRef(false) // Lock to prevent concurrent playSentence calls

  const usePiper = engineManager && engineManager.getPreference() !== 'browser' && engineManager.isPiperReadyForLang(detectedLang)

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
      if (index < 0 || index >= sentences.length) {
        return
      }

      const sentence = sentences[index]
      if (!sentence) return

      // Lock mechanism: prevent concurrent playSentence calls
      if (isPlayingSentenceRef.current) {
        console.warn('[useTts] playSentence already in progress, skipping duplicate call for index:', index)
        return
      }

      isPlayingSentenceRef.current = true

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
          
          // Release lock when speech actually starts
          isPlayingSentenceRef.current = false
          
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

          // Preload next sentence in background while current sentence is playing
          if (index < sentences.length - 1) {
            const nextSentence = sentences[index + 1]
            if (nextSentence && nextSentence.text.trim()) {
              const nextTtsOptions: TtsOptions = {
                voice: selectedVoice || undefined,
                rate,
              }
              if (usePiper && engineManager) {
                engineManager.preloadNext(nextSentence.text.trim(), detectedLang, nextTtsOptions).catch((err) => {
                  console.warn('[useTts] Failed to preload next sentence:', err)
                })
              } else if (engineRef.current?.preloadNext) {
                engineRef.current.preloadNext(nextSentence.text.trim(), nextTtsOptions).catch((err) => {
                  console.warn('[useTts] Failed to preload next sentence:', err)
                })
              }
            }
          }
        },
        onEnd: () => {
          if (startTimeout) {
            clearTimeout(startTimeout)
            startTimeout = null
          }

          // Release lock
          isPlayingSentenceRef.current = false

          if (isResumingRef.current || isRestartingRef.current) {
            return
          }

          // Only call onSentenceEnd if speech actually started
          if (speechStarted) {
            onSentenceEnd?.(sentence)
          }

          // Auto-play next sentence if still playing AND speech started
          if (isPlayingRef.current && speechStarted && index < sentences.length - 1) {
            // Small delay to ensure queue is ready
            setTimeout(() => {
              playSentence(index + 1).catch((err) => {
                console.error('Failed to play next sentence:', err)
                isPlayingSentenceRef.current = false
              })
            }, 10)
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

          // Release lock
          isPlayingSentenceRef.current = false

          if (isResumingRef.current) return

          if (!error.message.includes('interrupted') && !error.message.includes('canceled')) {
            console.error('TTS error:', error)
          }
          
          // If speech never started, try to continue to next sentence
          if (!speechStarted && isPlayingRef.current && index < sentences.length - 1) {
            console.warn('[useTts] Speech did not start for sentence', index, ', trying next sentence')
            setTimeout(() => {
              playSentence(index + 1).catch((err) => {
                console.error('Failed to play next sentence after error:', err)
                isPlayingSentenceRef.current = false
              })
            }, 10)
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
        // BUT: Don't cancel if we're just continuing to next sentence (queue will handle it)
        // Only cancel if this is a new start or retry
        if (!isRetry || index === currentSentenceIndex) {
          if (usePiper && engineManager) {
            engineManager.cancel()
          } else if (engineRef.current) {
            engineRef.current.cancel()
          }
          // Small delay after cancel to ensure it's processed (especially on Windows)
          await new Promise(resolve => setTimeout(resolve, 50))
        }

        // Set a timeout to detect if speech doesn't start within reasonable time
        // This handles cases where onStart never fires (browser bugs, etc.)
        startTimeout = setTimeout(() => {
          if (!speechStarted && isPlayingRef.current) {
            if (!isRetry) {
              console.warn('[useTts] Speech did not start within 2 seconds for sentence', index, 'text:', textToSpeak.substring(0, 50))
              console.log('[useTts] Retrying sentence', index)
              if (usePiper && engineManager) {
                engineManager.cancel()
              } else if (engineRef.current) {
                engineRef.current.cancel()
              }
              setTimeout(() => {
                if (isPlayingRef.current && !speechStarted) {
                  playSentence(index, true).catch((err) => {
                    console.error('Failed to retry sentence:', err)
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
            } else {
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

        if (usePiper && engineManager) {
          engineManager.speak(textToSpeak, detectedLang, ttsOptions).catch((error) => {
            if (startTimeout) {
              clearTimeout(startTimeout)
              startTimeout = null
            }
            console.error('Failed to speak (Piper):', error)
            if (!speechStarted && isPlayingRef.current && !isRetry) {
              setTimeout(() => {
                if (isPlayingRef.current && !speechStarted) {
                  playSentence(index, true).catch(() => {
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
        } else if (engineRef.current) {
          engineRef.current.speak(textToSpeak, ttsOptions).catch((error) => {
            if (startTimeout) {
              clearTimeout(startTimeout)
              startTimeout = null
            }
            console.error('Failed to speak:', error)
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
        }
      } catch (error) {
        // Release lock on error
        isPlayingSentenceRef.current = false
        
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
                isPlayingSentenceRef.current = false
              })
            }
          }, 200)
        } else {
          setIsPlaying(false)
          isPlayingRef.current = false
        }
      }
    },
    [sentences, selectedVoice, rate, onSentenceStart, onSentenceEnd, onProgress, usePiper, engineManager, detectedLang],
  )

  const play = useCallback(() => {
    if (!engineRef.current && !engineManager) return

    if (voices.length === 0 && !voicesLoading) {
      loadAndSelectVoice()
    }

    if (isPaused) {
      console.log('[useTts] Resuming by restarting current sentence', currentSentenceIndex)
      isResumingRef.current = true
      if (usePiper && engineManager) {
        engineManager.cancel()
      } else if (engineRef.current) {
        engineRef.current.cancel()
      }

      setIsPaused(false)
      isPlayingRef.current = true
      playSentence(currentSentenceIndex)
    } else {
      isPlayingRef.current = true
      playSentence(currentSentenceIndex)
    }
  }, [isPaused, currentSentenceIndex, playSentence, voices.length, voicesLoading, loadAndSelectVoice, usePiper, engineManager])

  const pause = useCallback(() => {
    if (usePiper && engineManager) {
      engineManager.pause()
    } else if (engineRef.current) {
      engineRef.current.pause()
    }
    setIsPaused(true)
  }, [usePiper, engineManager])

  const stop = useCallback(() => {
    if (usePiper && engineManager) {
      engineManager.cancel()
    }
    if (engineRef.current) {
      engineRef.current.cancel()
    }
    setIsPlaying(false)
    setIsPaused(false)
    isPlayingRef.current = false
  }, [usePiper, engineManager])

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

    if (isPlayingRef.current && !isPaused && sentences.length > 0) {
      const currentIndex = currentSentenceIndex
      isRestartingRef.current = true
      if (usePiper && engineManager) {
        engineManager.cancel()
      } else if (engineRef.current) {
        engineRef.current.cancel()
      }

      if (isPlayingRef.current && currentIndex >= 0 && currentIndex < sentences.length) {
        playSentence(currentIndex)
      } else {
        isRestartingRef.current = false
      }
    }

    prevRateRef.current = rate
  }, [rate, isPaused, currentSentenceIndex, sentences.length, playSentence, usePiper, engineManager])

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
    isSupported: (engineRef.current?.isSupported() ?? false) || (engineManager?.isSupported() ?? false),
  }
}
