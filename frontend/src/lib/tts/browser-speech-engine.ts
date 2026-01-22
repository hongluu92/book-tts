import { TtsEngine, TtsOptions } from './types'

export class BrowserSpeechEngine implements TtsEngine {
  private utterance: SpeechSynthesisUtterance | null = null
  private voices: SpeechSynthesisVoice[] = []
  private voicesLoaded = false

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices()
    }
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  loadVoices(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }

    const newVoices = speechSynthesis.getVoices()
    if (newVoices.length > 0) {
      this.voices = newVoices
      this.voicesLoaded = true
      console.log(`[BrowserSpeechEngine] Loaded ${newVoices.length} voices`)
    }
  }

  async getVoices(): Promise<SpeechSynthesisVoice[]> {
    // Always reload voices to get latest list
    this.loadVoices()
    
    if (this.voices.length > 0) {
      return this.voices
    }
    
    // If no voices yet, wait for them to load (with timeout)
    return new Promise((resolve) => {
      let attempts = 0
      const maxAttempts = 20 // 2 seconds total
      
      const checkVoices = () => {
        this.loadVoices()
        attempts++
        
        if (this.voices.length > 0) {
          resolve(this.voices)
        } else if (attempts >= maxAttempts) {
          // Timeout - return empty array
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

    this.cancel()

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      
      utterance.voice = options.voice || null
      utterance.rate = options.rate ?? 1.0
      utterance.pitch = options.pitch ?? 1.0
      utterance.volume = options.volume ?? 1.0

      utterance.onstart = () => {
        this.utterance = utterance
        options.onStart?.()
      }

      utterance.onend = () => {
        this.utterance = null
        options.onEnd?.()
        resolve()
      }

      utterance.onerror = (event) => {
        this.utterance = null
        // "interrupted" and "canceled" are normal when user stops TTS
        // Don't treat them as errors
        if (event.error === 'interrupted' || event.error === 'canceled') {
          options.onEnd?.()
          resolve()
          return
        }
        
        const error = new Error(`Speech synthesis error: ${event.error}`)
        options.onError?.(error)
        reject(error)
      }

      speechSynthesis.speak(utterance)
    })
  }

  cancel(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.cancel()
      this.utterance = null
    }
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
}
