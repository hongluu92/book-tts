import { BrowserSpeechEngine } from './browser-speech-engine'
import { PiperWasmEngine } from './piper-wasm-engine'
import { TtsEngine, TtsOptions, TtsEngineType, ModelDownloadProgress, PIPER_VOICES } from './types'

export type EnginePreference = 'auto' | 'piper' | 'browser'

interface EngineManagerState {
  activeEngine: TtsEngineType
  piperReady: boolean
  piperDownloading: boolean
  downloadProgress: ModelDownloadProgress | null
}

export class TtsEngineManager {
  private browserEngine: BrowserSpeechEngine
  private piperEngine: PiperWasmEngine
  private preference: EnginePreference = 'auto'
  private piperReadyVoices: Set<string> = new Set()
  private onStateChange: ((state: EngineManagerState) => void) | null = null

  constructor() {
    this.browserEngine = new BrowserSpeechEngine()
    this.piperEngine = new PiperWasmEngine()
  }

  setPreference(pref: EnginePreference) {
    this.preference = pref
  }

  getPreference(): EnginePreference {
    return this.preference
  }

  setStateChangeCallback(cb: (state: EngineManagerState) => void) {
    this.onStateChange = cb
    this.piperEngine.setDownloadProgressCallback((progress) => {
      cb({
        activeEngine: this.getActiveEngineType(),
        piperReady: this.piperReadyVoices.size > 0,
        piperDownloading: progress.status === 'downloading',
        downloadProgress: progress,
      })
    })
  }

  private getActiveEngineType(): TtsEngineType {
    if (this.preference === 'browser') return 'browser'
    if (this.piperReadyVoices.size > 0) return 'piper-wasm'
    return 'browser'
  }

  private getEngineForLang(lang: string): TtsEngine {
    if (this.preference === 'browser') return this.browserEngine

    const piperVoice = PIPER_VOICES.find((v) => v.lang === lang)
    if (piperVoice && this.piperReadyVoices.has(piperVoice.voiceId)) {
      return this.piperEngine
    }

    return this.browserEngine
  }

  getBrowserEngine(): BrowserSpeechEngine {
    return this.browserEngine
  }

  getPiperEngine(): PiperWasmEngine {
    return this.piperEngine
  }

  isPiperReady(): boolean {
    return this.piperReadyVoices.size > 0
  }

  isPiperReadyForLang(lang: string): boolean {
    const voice = PIPER_VOICES.find((v) => v.lang === lang)
    return voice ? this.piperReadyVoices.has(voice.voiceId) : false
  }

  getState(): EngineManagerState {
    return {
      activeEngine: this.getActiveEngineType(),
      piperReady: this.piperReadyVoices.size > 0,
      piperDownloading: false,
      downloadProgress: null,
    }
  }

  async initPiper(): Promise<void> {
    if (!this.piperEngine.isSupported()) return

    try {
      const stored = await this.piperEngine.getStoredVoices()
      for (const voiceId of stored) {
        this.piperReadyVoices.add(voiceId)
      }

      // Don't eagerly init any voice here — let speak() init on-demand.
      // This avoids loading the wrong model and the expensive re-init cost.
      this.notifyStateChange()
    } catch (error) {
      console.warn('[TtsEngineManager] Failed to init Piper:', error)
    }
  }

  async downloadVoice(voiceId: string): Promise<void> {
    try {
      await this.piperEngine.downloadVoice(voiceId)
      this.piperReadyVoices.add(voiceId)
      this.notifyStateChange()
    } catch (error) {
      console.error('[TtsEngineManager] Download failed:', error)
      throw error
    }
  }

  async downloadVoicesInBackground(langs: string[]): Promise<void> {
    for (const lang of langs) {
      const voice = PIPER_VOICES.find((v) => v.lang === lang)
      if (!voice || this.piperReadyVoices.has(voice.voiceId)) continue

      try {
        await this.downloadVoice(voice.voiceId)
      } catch (error) {
        console.warn(`[TtsEngineManager] Background download failed for ${voice.voiceId}:`, error)
      }
    }
  }

  async speak(text: string, lang: string, options: TtsOptions): Promise<void> {
    const engine = this.getEngineForLang(lang)

    if (engine.getEngineType() === 'piper-wasm') {
      const piperVoice = PIPER_VOICES.find((v) => v.lang === lang)
      if (piperVoice) {
        try {
          await this.piperEngine.initVoice(piperVoice.voiceId)
          await engine.speak(text, options)
          return
        } catch (error) {
          console.warn('[TtsEngineManager] Piper failed, falling back to browser:', error)
        }
      }
    }

    await this.browserEngine.speak(text, options)
  }

  cancel(): void {
    this.piperEngine.cancel()
    this.browserEngine.cancel()
  }

  pause(): void {
    this.piperEngine.pause()
    this.browserEngine.pause()
  }

  resume(): void {
    this.piperEngine.resume()
    this.browserEngine.resume()
  }

  isSupported(): boolean {
    return this.browserEngine.isSupported() || this.piperEngine.isSupported()
  }

  private notifyStateChange() {
    this.onStateChange?.(this.getState())
  }

  destroy(): void {
    this.piperEngine.destroy()
  }
}
