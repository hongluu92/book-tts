import { TtsEngine, TtsOptions } from './types'

function cleanTextForTts(text: string): string {
  return text
    .replace(/["""'''']/g, '')
    .replace(/\s+"/g, '"')
    .replace(/"\s+/g, '"')
    .replace(/\s+'/g, "'")
    .replace(/'\s+/g, "'")
    .trim()
}

interface QueuedSpeak {
  text: string
  options: TtsOptions
  resolve: () => void
  reject: (error: Error) => void
}

export class BrowserSpeechEngine implements TtsEngine {
  private utterance: SpeechSynthesisUtterance | null = null
  private voices: SpeechSynthesisVoice[] = []
  private voicesLoaded = false
  private speakTimeout: NodeJS.Timeout | null = null
  private isWindows: boolean = false
  private speakQueue: QueuedSpeak[] = []
  private isSpeaking = false

  constructor() {
    if (typeof window !== 'undefined') {
      this.isWindows = navigator.userAgent.includes('Windows')
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices()
    }
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  getEngineType(): 'browser' {
    return 'browser'
  }

  loadVoices(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }

    const newVoices = speechSynthesis.getVoices()
    if (newVoices.length > 0) {
      this.voices = newVoices
      this.voicesLoaded = true
    }
  }

  async getVoices(): Promise<SpeechSynthesisVoice[]> {
    this.loadVoices()

    if (this.voices.length > 0) {
      return this.voices
    }

    return new Promise((resolve) => {
      let attempts = 0
      const maxAttempts = 20

      const checkVoices = () => {
        this.loadVoices()
        attempts++

        if (this.voices.length > 0) {
          resolve(this.voices)
        } else if (attempts >= maxAttempts) {
          console.warn('[BrowserSpeechEngine] Timeout waiting for voices')
          this.voicesLoaded = true
          resolve(this.voices)
        } else {
          setTimeout(checkVoices, 100)
        }
      }

      checkVoices()
    })
  }

  async speak(text: string, options: TtsOptions = {}): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Speech synthesis is not supported in this browser')
    }

    const cleanedText = cleanTextForTts(text)

    // Check if text is empty after cleaning
    if (!cleanedText || cleanedText.length === 0) {
      console.warn('[BrowserSpeechEngine] Empty text after cleaning, resolving immediately')
      // Resolve immediately for empty text
      options.onStart?.()
      options.onEnd?.()
      return Promise.resolve()
    }

    // Queue the speak request if already speaking
    return new Promise<void>((resolve, reject) => {
      const queued: QueuedSpeak = { text: cleanedText, options, resolve, reject }
      
      if (this.isSpeaking || speechSynthesis.speaking) {
        // Add to queue
        this.speakQueue.push(queued)
        console.log('[BrowserSpeechEngine] Queued speak request, queue length:', this.speakQueue.length)
        return
      }

      // Process immediately
      this.processSpeak(queued)
    })
  }

  private processSpeak(queued: QueuedSpeak): void {
    if (this.isSpeaking || speechSynthesis.speaking) {
      // Should not happen, but add to queue just in case
      this.speakQueue.push(queued)
      return
    }

    this.isSpeaking = true
    const { text, options, resolve, reject } = queued

    console.log('[BrowserSpeechEngine] Speaking:', {
      textLength: text.length,
      voice: options.voice?.name,
      voiceLang: options.voice?.lang,
      isWindows: this.isWindows,
    })

    this.speakInternal(text, options, () => {
      this.isSpeaking = false
      
      // Process next item in queue
      if (this.speakQueue.length > 0) {
        const next = this.speakQueue.shift()!
        // Small delay to ensure speechSynthesis is ready
        setTimeout(() => {
          this.processSpeak(next)
        }, 50)
      }
      
      resolve()
    }, (error) => {
      this.isSpeaking = false
      
      // Process next in queue even on error
      if (this.speakQueue.length > 0) {
        const next = this.speakQueue.shift()!
        setTimeout(() => {
          this.processSpeak(next)
        }, 50)
      }
      
      reject(error)
    })
  }

  private speakInternal(
    text: string,
    options: TtsOptions,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    const utterance = new SpeechSynthesisUtterance(text)
    let startFired = false
    let endFired = false
    let startTimeout: NodeJS.Timeout | null = null

    utterance.voice = options.voice || null
    utterance.rate = options.rate ?? 1.0
    utterance.pitch = options.pitch ?? 1.0
    utterance.volume = options.volume ?? 1.0

    // Set a timeout to detect if onstart never fires
    startTimeout = setTimeout(() => {
      if (!startFired && !endFired) {
        console.warn('[BrowserSpeechEngine] onstart did not fire within 1 second, assuming it started')
        // Assume it started and fire onStart manually
        if (!startFired) {
          startFired = true
          this.utterance = utterance
          options.onStart?.()
        }
      }
    }, 1000) as unknown as NodeJS.Timeout

    utterance.onstart = () => {
      if (startTimeout) {
        clearTimeout(startTimeout)
        startTimeout = null
      }
      if (!startFired) {
        startFired = true
        this.utterance = utterance
        console.log('[BrowserSpeechEngine] onstart fired')
        options.onStart?.()
      }
    }

    utterance.onend = () => {
      // Only process if this is still the current utterance (prevent race conditions)
      if (this.utterance !== utterance) {
        console.warn('[BrowserSpeechEngine] onend fired for non-current utterance, ignoring')
        return
      }
      
      if (startTimeout) {
        clearTimeout(startTimeout)
        startTimeout = null
      }
      if (!endFired) {
        endFired = true
        this.utterance = null
        if (this.speakTimeout) {
          clearTimeout(this.speakTimeout)
          this.speakTimeout = null
        }
        console.log('[BrowserSpeechEngine] onend fired')
        // Ensure onStart was called (in case it didn't fire)
        if (!startFired) {
          startFired = true
          options.onStart?.()
        }
        options.onEnd?.()
        
        // Mark as not speaking and process next in queue
        this.isSpeaking = false
        
        // Process next item in queue
        if (this.speakQueue.length > 0) {
          const next = this.speakQueue.shift()!
          // Use setTimeout to ensure current call stack completes
          setTimeout(() => {
            this.processSpeak(next)
          }, 50)
        }
        
        resolve()
      }
    }

    utterance.onerror = (event) => {
      // Only process if this is still the current utterance
      if (this.utterance !== utterance && event.error !== 'interrupted' && event.error !== 'canceled') {
        console.warn('[BrowserSpeechEngine] onerror fired for non-current utterance, ignoring')
        return
      }
      
      if (startTimeout) {
        clearTimeout(startTimeout)
        startTimeout = null
      }
      this.utterance = null
      if (this.speakTimeout) {
        clearTimeout(this.speakTimeout)
        this.speakTimeout = null
      }
      
      // Mark as not speaking
      this.isSpeaking = false
      
      if (event.error === 'interrupted' || event.error === 'canceled') {
        // Ensure onStart was called before onEnd
        if (!startFired && !endFired) {
          startFired = true
          options.onStart?.()
        }
        if (!endFired) {
          endFired = true
          options.onEnd?.()
        }
        
        // Process next in queue even on cancel/interrupt
        if (this.speakQueue.length > 0) {
          const next = this.speakQueue.shift()!
          setTimeout(() => {
            this.processSpeak(next)
          }, 50)
        }
        
        resolve()
        return
      }

      console.error('[BrowserSpeechEngine] onerror:', event.error)
      const error = new Error(`Speech synthesis error: ${event.error}`)
      options.onError?.(error)
      
      // Process next in queue even on error
      if (this.speakQueue.length > 0) {
        const next = this.speakQueue.shift()!
        setTimeout(() => {
          this.processSpeak(next)
        }, 50)
      }
      
      reject(error)
    }

    try {
      speechSynthesis.speak(utterance)

      if (this.isWindows) {
        const originalHandler = utterance.onstart
        utterance.onstart = (event) => {
          if (originalHandler) {
            originalHandler.call(utterance, event)
          }

          this.speakTimeout = setTimeout(() => {
            if (this.utterance === utterance && speechSynthesis.speaking) {
              console.warn('[BrowserSpeechEngine] Windows TTS bug detected: possible stuck utterance')
            }
          }, 500) as unknown as NodeJS.Timeout
        }
      }
    } catch (error) {
      if (startTimeout) {
        clearTimeout(startTimeout)
        startTimeout = null
      }
      console.error('[BrowserSpeechEngine] Exception calling speechSynthesis.speak:', error)
      reject(error as Error)
    }
  }

  cancel(): void {
    if (this.speakTimeout) {
      clearTimeout(this.speakTimeout)
      this.speakTimeout = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.cancel()
      this.utterance = null
    }
    
    // Clear queue and reject all pending requests
    this.speakQueue.forEach((queued) => {
      queued.reject(new Error('Speech synthesis canceled'))
    })
    this.speakQueue = []
    this.isSpeaking = false
  }

  pause(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.pause()
    }
  }

  resume(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.resume()
    }
  }

  // Browser Speech Synthesis doesn't support true preloading
  // These methods are no-ops for compatibility
  async preloadNext(_text: string, _options: TtsOptions = {}): Promise<void> {
    // Browser Speech Synthesis doesn't support pre-generating audio
    // The utterance will be created on-demand when speak() is called
    return Promise.resolve()
  }

  hasPreloaded(): boolean {
    return false
  }

  async usePreloaded(_options: TtsOptions = {}): Promise<void> {
    throw new Error('Browser Speech Synthesis does not support preloaded audio')
  }
}
