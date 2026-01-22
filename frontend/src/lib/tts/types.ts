export interface TtsEngine {
  speak(text: string, options: TtsOptions): Promise<void>
  cancel(): void
  pause(): void
  resume(): void
  getVoices(): Promise<SpeechSynthesisVoice[]>
  isSupported(): boolean
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
