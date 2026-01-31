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

export class PiperWasmEngine implements TtsEngine {
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private currentVoiceId: string | null = null
  private isInitialized = false
  private isPausedState = false
  private startedAt = 0
  private currentBuffer: AudioBuffer | null = null
  private onDownloadProgress: ((progress: ModelDownloadProgress) => void) | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null

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

    const ctx = this.getAudioContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    options.onStart?.()

    try {
      const blob = await this.session.predict(text)

      const arrayBuffer = await blob.arrayBuffer()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      this.currentBuffer = audioBuffer

      return new Promise<void>((resolve) => {
        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.playbackRate.value = options.rate ?? 1.0
        source.connect(ctx.destination)
        this.currentSource = source
        this.isPausedState = false
        this.startedAt = ctx.currentTime

        source.onended = () => {
          this.currentSource = null
          this.currentBuffer = null
          if (!this.isPausedState) {
            options.onEnd?.()
          }
          resolve()
        }

        source.start(0)
      })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      options.onError?.(err)
      throw err
    }
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
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.isInitialized = false
    this.currentVoiceId = null
    this.session = null
  }
}
