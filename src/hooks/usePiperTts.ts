'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { TtsEngineManager, EnginePreference } from '@/lib/tts/engine-manager'
import { ModelDownloadProgress, PIPER_VOICES } from '@/lib/tts/types'

interface UsePiperTtsReturn {
  engineManager: TtsEngineManager | null
  piperReady: boolean
  piperDownloading: boolean
  piperInitDone: boolean
  downloadProgress: ModelDownloadProgress | null
  preference: EnginePreference
  setPreference: (pref: EnginePreference) => void
  downloadVoice: (voiceId: string) => Promise<void>
  downloadAllVoices: () => Promise<void>
  storedVoices: string[]
}

const PREFERENCE_KEY = 'tts-engine-preference'

export function usePiperTts(): UsePiperTtsReturn {
  const [piperReady, setPiperReady] = useState(false)
  const [piperDownloading, setPiperDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null)
  const [storedVoices, setStoredVoices] = useState<string[]>([])
  const [preference, setPreferenceState] = useState<EnginePreference>('auto')
  const [piperInitDone, setPiperInitDone] = useState(false)
  const managerRef = useRef<TtsEngineManager | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(PREFERENCE_KEY) as EnginePreference | null
    if (saved && ['auto', 'piper', 'browser'].includes(saved)) {
      setPreferenceState(saved)
    }
  }, [])

  useEffect(() => {
    const manager = new TtsEngineManager()
    managerRef.current = manager

    manager.setPreference(preference)

    manager.setStateChangeCallback((state) => {
      setPiperReady(state.piperReady)
      setPiperDownloading(state.piperDownloading)
      setDownloadProgress(state.downloadProgress)
    })

    manager.initPiper().then(async () => {
      setPiperReady(manager.isPiperReady())
      try {
        const stored = await manager.getPiperEngine().getStoredVoices()
        setStoredVoices(stored)
      } catch {
        // ignore
      }
      setPiperInitDone(true)
    })

    return () => {
      manager.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.setPreference(preference)
    }
  }, [preference])

  const setPreference = useCallback((pref: EnginePreference) => {
    setPreferenceState(pref)
    localStorage.setItem(PREFERENCE_KEY, pref)
  }, [])

  const downloadVoice = useCallback(async (voiceId: string) => {
    if (!managerRef.current) return
    await managerRef.current.downloadVoice(voiceId)
    const stored = await managerRef.current.getPiperEngine().getStoredVoices()
    setStoredVoices(stored)
  }, [])

  const downloadAllVoices = useCallback(async () => {
    if (!managerRef.current) return
    const langs = PIPER_VOICES.map((v) => v.lang)
    await managerRef.current.downloadVoicesInBackground(langs)
    const stored = await managerRef.current.getPiperEngine().getStoredVoices()
    setStoredVoices(stored)
  }, [])

  return {
    engineManager: managerRef.current,
    piperReady,
    piperDownloading,
    piperInitDone,
    downloadProgress,
    preference,
    setPreference,
    downloadVoice,
    downloadAllVoices,
    storedVoices,
  }
}
