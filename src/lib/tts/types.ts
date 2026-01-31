export type TtsEngineType = 'browser' | 'piper-wasm'

export interface TtsEngine {
  speak(text: string, options: TtsOptions): Promise<void>
  cancel(): void
  pause(): void
  resume(): void
  isSupported(): boolean
  getEngineType(): TtsEngineType
}

export interface TtsOptions {
  voice?: SpeechSynthesisVoice
  rate?: number
  pitch?: number
  volume?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
}

export interface Sentence {
  sentenceIndex: number
  text: string
  markerId: string
}

export interface PiperVoiceConfig {
  voiceId: string
  lang: string
  label: string
}

export const PIPER_VOICES: PiperVoiceConfig[] = [
  { voiceId: 'vi_VN-vais1000-medium', lang: 'vi', label: 'Vietnamese (Vais1000)' },
  { voiceId: 'en_US-hfc_female-medium', lang: 'en', label: 'English (HFC Female)' },
]

export interface ModelDownloadProgress {
  voiceId: string
  loaded: number
  total: number
  status: 'idle' | 'downloading' | 'ready' | 'error'
}
