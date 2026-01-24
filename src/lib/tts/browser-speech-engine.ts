import { TtsEngine, TtsOptions } from './types'

/**
 * Clean text before TTS speaks it
 * Removes smart quotes and trims spacing issues
 */
function cleanTextForTts(text: string): string {
  return text
    // Remove all smart quotes completely
    .replace(/["""'''']/g, '')
    // Clean up spacing around remaining quotes
    .replace(/\s+"/g, '"')
    .replace(/"\s+/g, '"')
    .replace(/\s+'/g, "'")
    .replace(/'\s+/g, "'")
    .trim()
}

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

    // Clean text before speaking
    const cleanedText = cleanTextForTts(text)

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(cleanedText)
      
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
