import { TtsEngine, TtsOptions, TtsEngineType, ModelDownloadProgress, PIPER_VOICES } from './types'

// Lazy-loaded piper-tts-web module (browser-only, loaded via dynamic import)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ttsModule: any = null

async function getTtsModule() {
  if (!ttsModule) {
    ttsModule = await import('@mintplex-labs/piper-tts-web')
  }
  return ttsModule
}

interface QueuedSpeak {
  text: string
  options: TtsOptions
  resolve: () => void
  reject: (error: Error) => void
}

export class PiperWasmEngine implements TtsEngine {
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private currentVoiceId: string | null = null
  private isInitialized = false
  private isPausedState = false
  private startedAt = 0
  private currentBuffer: AudioBuffer | null = null
  private nextBuffer: AudioBuffer | null = null // Preloaded buffer for next sentence
  private nextText: string | null = null // Text of preloaded sentence
  private nextNextBuffer: AudioBuffer | null = null // Preloaded buffer for sentence after next (for short sentences)
  private nextNextText: string | null = null // Text of preloaded sentence after next
  private onDownloadProgress: ((progress: ModelDownloadProgress) => void) | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null
  private speakQueue: QueuedSpeak[] = []
  private isSpeaking = false // Track if currently speaking

  isSupported(): boolean {
    return typeof window !== 'undefined' && typeof AudioContext !== 'undefined'
  }

  getEngineType(): TtsEngineType {
    return 'piper-wasm'
  }

  setDownloadProgressCallback(cb: (progress: ModelDownloadProgress) => void) {
    this.onDownloadProgress = cb
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }
    return this.audioContext
  }

  async initVoice(voiceId: string): Promise<void> {
    if (this.session && this.currentVoiceId === voiceId) return

    const tts = await getTtsModule()

    // piper-tts-web uses a singleton TtsSession — creating a new one with a
    // different voiceId only updates the property without reloading the model.
    // To switch voices we must destroy the singleton first, then create fresh.
    if (this.session && this.currentVoiceId !== voiceId) {
      // Reset the singleton so the next constructor creates a new session
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(tts.TtsSession as any)._instance = null
      this.session = null
    }

    if (!this.session) {
      this.session = new tts.TtsSession({
        voiceId,
        progress: (e: { url?: string; loaded?: number; total?: number }) => {
          if (this.onDownloadProgress && e.loaded !== undefined && e.total !== undefined) {
            this.onDownloadProgress({
              voiceId,
              loaded: e.loaded,
              total: e.total,
              status: 'downloading',
            })
          }
        },
      })
      await this.session.init()
    }

    this.currentVoiceId = voiceId
    this.isInitialized = true
  }

  async downloadVoice(voiceId: string): Promise<void> {
    const tts = await getTtsModule()
    if (this.onDownloadProgress) {
      this.onDownloadProgress({ voiceId, loaded: 0, total: 0, status: 'downloading' })
    }
    await tts.download(voiceId, (progress: { loaded: number; total: number }) => {
      if (this.onDownloadProgress) {
        this.onDownloadProgress({
          voiceId,
          loaded: progress.loaded,
          total: progress.total,
          status: 'downloading',
        })
      }
    })
    if (this.onDownloadProgress) {
      this.onDownloadProgress({ voiceId, loaded: 1, total: 1, status: 'ready' })
    }
  }

  async getStoredVoices(): Promise<string[]> {
    const tts = await getTtsModule()
    return await tts.stored()
  }

  async speak(text: string, options: TtsOptions = {}): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Piper WASM TTS is not supported in this browser')
    }

    if (!this.isInitialized || !this.session) {
      throw new Error('Piper voice not initialized. Call initVoice() first.')
    }

    // Check if text only contains curly quotes - skip silently
    const normalizedText = text.trim()
    const textWithoutCurlyQuotes = normalizedText.replace(/[""]/g, '').trim()
    if (!textWithoutCurlyQuotes || textWithoutCurlyQuotes.length === 0) {
      // Skip silently - just resolve immediately
      return Promise.resolve()
    }

    // Queue the speak request if already speaking
    return new Promise<void>((resolve, reject) => {
      const queued: QueuedSpeak = { text, options, resolve, reject }
      
      if (this.isSpeaking) {
        // Add to queue
        this.speakQueue.push(queued)
        console.log('[PiperWasmEngine] Queued speak request, queue length:', this.speakQueue.length)
        return
      }

      // Process immediately
      this.processSpeak(queued)
    })
  }

  private async processSpeak(queued: QueuedSpeak): Promise<void> {
    if (this.isSpeaking) {
      // Should not happen, but add to queue just in case
      this.speakQueue.push(queued)
      return
    }

    this.isSpeaking = true
    const { text, options, resolve, reject } = queued

    try {
      const ctx = this.getAudioContext()
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      // Check if we have preloaded audio for this text
      // Normalize text for comparison (trim whitespace)
      const normalizedText = text.trim()
      let audioBuffer: AudioBuffer
      if (this.nextBuffer && this.nextText && this.nextText.trim() === normalizedText) {
        // Use preloaded buffer
        audioBuffer = this.nextBuffer
        this.nextBuffer = null
        this.nextText = null
        
        // Move nextNext to next if available
        if (this.nextNextBuffer && this.nextNextText) {
          this.nextBuffer = this.nextNextBuffer
          this.nextText = this.nextNextText
          this.nextNextBuffer = null
          this.nextNextText = null
        }
        
        console.log('[PiperWasmEngine] Using preloaded audio for:', normalizedText.substring(0, 50))
      } else if (this.nextNextBuffer && this.nextNextText && this.nextNextText.trim() === normalizedText) {
        // Use nextNext buffer (skip next)
        audioBuffer = this.nextNextBuffer
        this.nextNextBuffer = null
        this.nextNextText = null
        this.nextBuffer = null
        this.nextText = null
        console.log('[PiperWasmEngine] Using preloaded nextNext audio for:', normalizedText.substring(0, 50))
      } else {
        // Generate new audio
        try {
          const blob = await this.session.predict(text)
          const arrayBuffer = await blob.arrayBuffer()
          audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          options.onError?.(err)
          throw err
        }
      }

      this.currentBuffer = audioBuffer
      options.onStart?.()

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.playbackRate.value = options.rate ?? 1.0
      source.connect(ctx.destination)
      this.currentSource = source
      this.isPausedState = false
      this.startedAt = ctx.currentTime

      source.onended = () => {
        // Only process if this is still the current source (prevent race conditions)
        if (this.currentSource !== source) {
          console.warn('[PiperWasmEngine] onended fired for non-current source, ignoring')
          return
        }
        
        this.currentSource = null
        this.currentBuffer = null
        if (!this.isPausedState) {
          options.onEnd?.()
        }
        
        // Mark as not speaking and process next in queue
        this.isSpeaking = false
        
        // Process next item in queue
        if (this.speakQueue.length > 0) {
          const next = this.speakQueue.shift()!
          // Use setTimeout to ensure current call stack completes
          setTimeout(() => {
            this.processSpeak(next).catch((err) => {
              console.error('[PiperWasmEngine] Error processing queued speak:', err)
              next.reject(err)
            })
          }, 0)
        }
        
        resolve()
      }

      source.start(0)
    } catch (error) {
      this.isSpeaking = false
      const err = error instanceof Error ? error : new Error(String(error))
      reject(err)
      
      // Process next in queue even on error
      if (this.speakQueue.length > 0) {
        const next = this.speakQueue.shift()!
        this.processSpeak(next).catch((err) => {
          console.error('[PiperWasmEngine] Error processing queued speak after error:', err)
          next.reject(err)
        })
      }
    }
  }

  async preloadNext(text: string, options: TtsOptions = {}): Promise<void> {
    if (!this.isSupported() || !this.isInitialized || !this.session) {
      return
    }

    // Normalize text for comparison
    const normalizedText = text.trim()
    if (!normalizedText) {
      return
    }

    // Skip preloading if text only contains curly quotes
    const textWithoutCurlyQuotes = normalizedText.replace(/[""]/g, '').trim()
    if (!textWithoutCurlyQuotes || textWithoutCurlyQuotes.length === 0) {
      return
    }

    // Check if already preloaded in next or nextNext
    if ((this.nextText && this.nextText.trim() === normalizedText && this.nextBuffer) ||
        (this.nextNextText && this.nextNextText.trim() === normalizedText && this.nextNextBuffer)) {
      return
    }

    try {
      // If nextBuffer is already occupied, preload into nextNextBuffer
      if (this.nextBuffer && this.nextText) {
        // Preload into nextNextBuffer
        const blob = await this.session.predict(normalizedText)
        const arrayBuffer = await blob.arrayBuffer()
        const ctx = this.getAudioContext()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        
        this.nextNextBuffer = audioBuffer
        this.nextNextText = normalizedText
        console.log('[PiperWasmEngine] Preloaded nextNext audio for:', normalizedText.substring(0, 50))
      } else {
        // Preload into nextBuffer
        const blob = await this.session.predict(normalizedText)
        const arrayBuffer = await blob.arrayBuffer()
        const ctx = this.getAudioContext()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        
        this.nextBuffer = audioBuffer
        this.nextText = normalizedText
        console.log('[PiperWasmEngine] Preloaded audio for:', normalizedText.substring(0, 50))
      }
    } catch (error) {
      console.warn('[PiperWasmEngine] Failed to preload audio:', error)
      // Don't throw - preload failure shouldn't break playback
    }
  }

  hasPreloaded(): boolean {
    return this.nextBuffer !== null
  }

  async usePreloaded(options: TtsOptions = {}): Promise<void> {
    if (!this.nextBuffer || !this.nextText) {
      throw new Error('No preloaded audio available')
    }

    // Use the preloaded buffer - speak() will check and use it
    const text = this.nextText
    return this.speak(text, options)
  }

  cancel(): void {
    this.isPausedState = false
    if (this.currentSource) {
      try {
        this.currentSource.onended = null
        this.currentSource.stop()
      } catch {
        // already stopped
      }
      this.currentSource = null
    }
    this.currentBuffer = null
    
    // Clear queue and reject all pending requests
    this.speakQueue.forEach((queued) => {
      queued.reject(new Error('Speech synthesis canceled'))
    })
    this.speakQueue = []
    this.isSpeaking = false
    
    // Keep nextBuffer - it's for the next sentence
  }

  pause(): void {
    if (this.audioContext && this.currentSource) {
      this.isPausedState = true
      this.audioContext.suspend()
    }
  }

  resume(): void {
    if (this.audioContext && this.isPausedState) {
      this.isPausedState = false
      this.audioContext.resume()
    }
  }

  getAvailablePiperVoices() {
    return PIPER_VOICES
  }

  destroy(): void {
    this.cancel()
    this.nextBuffer = null
    this.nextText = null
    this.nextNextBuffer = null
    this.nextNextText = null
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.isInitialized = false
    this.currentVoiceId = null
    this.session = null
  }
}
