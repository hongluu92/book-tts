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

export class BrowserSpeechEngine implements TtsEngine {
  private utterance: SpeechSynthesisUtterance | null = null
  private voices: SpeechSynthesisVoice[] = []
  private voicesLoaded = false
  private speakTimeout: NodeJS.Timeout | null = null
  private isWindows: boolean = false

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

    console.log('[BrowserSpeechEngine] Speaking:', {
      textLength: cleanedText.length,
      voice: options.voice?.name,
      voiceLang: options.voice?.lang,
      isWindows: this.isWindows,
    })

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(cleanedText)

      utterance.voice = options.voice || null
      utterance.rate = options.rate ?? 1.0
      utterance.pitch = options.pitch ?? 1.0
      utterance.volume = options.volume ?? 1.0

      utterance.onstart = () => {
        this.utterance = utterance
        console.log('[BrowserSpeechEngine] onstart fired')
        options.onStart?.()
      }

      utterance.onend = () => {
        this.utterance = null
        if (this.speakTimeout) {
          clearTimeout(this.speakTimeout)
          this.speakTimeout = null
        }
        console.log('[BrowserSpeechEngine] onend fired')
        options.onEnd?.()
        resolve()
      }

      utterance.onerror = (event) => {
        this.utterance = null
        if (this.speakTimeout) {
          clearTimeout(this.speakTimeout)
          this.speakTimeout = null
        }
        if (event.error === 'interrupted' || event.error === 'canceled') {
          options.onEnd?.()
          resolve()
          return
        }

        console.error('[BrowserSpeechEngine] onerror:', event.error)
        const error = new Error(`Speech synthesis error: ${event.error}`)
        options.onError?.(error)
        reject(error)
      }

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
    })
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
