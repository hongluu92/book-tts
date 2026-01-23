import { requestGoogleDriveAccessToken } from '@/lib/googleDriveAuth'

export type ProgressRecord = {
  chapterId: string
  sentenceIndex: number
  markerId: string
  ttsVoice?: string
  ttsRate?: number
  updatedAtMs: number
}

type DriveProgressFileV1 = {
  version: 1
  updatedAtMs: number
  books: Record<string, ProgressRecord>
}

const PROGRESS_FILENAME = 'epub-reader-progress-v1.json'

function emptyFile(): DriveProgressFileV1 {
  return { version: 1, updatedAtMs: Date.now(), books: {} }
}

async function driveFetch<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive API error ${res.status}: ${text || res.statusText}`)
  }
  return (await res.json()) as T
}

async function driveFetchText(accessToken: string, url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive API error ${res.status}: ${text || res.statusText}`)
  }
  return await res.text()
}

type DriveFileList = {
  files: Array<{ id: string; name: string }>
}

async function findProgressFileId(accessToken: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${PROGRESS_FILENAME}' and 'appDataFolder' in parents and trashed=false`)
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&fields=files(id,name)`
  const list = await driveFetch<DriveFileList>(accessToken, url)
  return list.files?.[0]?.id ?? null
}

async function createProgressFile(accessToken: string, initial: DriveProgressFileV1): Promise<string> {
  const metadata = {
    name: PROGRESS_FILENAME,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  }
  const boundary = '-------314159265358979323846'
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(initial)}\r\n` +
    `--${boundary}--`

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive create file error ${res.status}: ${text || res.statusText}`)
  }
  const json = (await res.json()) as { id: string }
  return json.id
}

async function getOrCreateProgressFileId(accessToken: string): Promise<string> {
  const existing = await findProgressFileId(accessToken)
  if (existing) return existing
  return await createProgressFile(accessToken, emptyFile())
}

async function readProgressFile(accessToken: string, fileId: string): Promise<DriveProgressFileV1> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  const text = await driveFetchText(accessToken, url)
  try {
    const parsed = JSON.parse(text) as DriveProgressFileV1
    if (parsed?.version !== 1 || typeof parsed.updatedAtMs !== 'number' || typeof parsed.books !== 'object') {
      return emptyFile()
    }
    return parsed
  } catch {
    return emptyFile()
  }
}

async function writeProgressFile(accessToken: string, fileId: string, data: DriveProgressFileV1) {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive update file error ${res.status}: ${text || res.statusText}`)
  }
}

export async function loadRemoteBookProgress(bookKey: string): Promise<ProgressRecord | null> {
  const { accessToken } = await requestGoogleDriveAccessToken({ interactive: false })
  const fileId = await getOrCreateProgressFileId(accessToken)
  const file = await readProgressFile(accessToken, fileId)
  return file.books[bookKey] ?? null
}

export async function upsertRemoteBookProgress(bookKey: string, progress: Omit<ProgressRecord, 'updatedAtMs'> & { updatedAtMs?: number }) {
  const { accessToken } = await requestGoogleDriveAccessToken({ interactive: true })
  const fileId = await getOrCreateProgressFileId(accessToken)
  const current = await readProgressFile(accessToken, fileId)

  const nextRecord: ProgressRecord = {
    ...progress,
    updatedAtMs: progress.updatedAtMs ?? Date.now(),
  }

  const existing = current.books[bookKey]
  const shouldWrite = !existing || (existing.updatedAtMs ?? 0) <= nextRecord.updatedAtMs

  const next: DriveProgressFileV1 = shouldWrite
    ? {
        version: 1,
        updatedAtMs: Date.now(),
        books: {
          ...current.books,
          [bookKey]: nextRecord,
        },
      }
    : current

  if (shouldWrite) {
    await writeProgressFile(accessToken, fileId, next)
  }
}

