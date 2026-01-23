# Data Model — v2

## Identifiers

### `bookFingerprint`

Used as the stable cross-device identifier for a book (because v2 has no backend `bookId`).

**Recommended**:

- `bookFingerprint = sha256(fileSizeBytes + first64KB + last64KB)`
- Fallback if last chunk not available: `sha256(fileSizeBytes + first64KB)`

## Local storage (IndexedDB via Dexie)

### `BookLocal`

- `bookFingerprint: string` (primary key)
- `title: string`
- `author: string | null`
- `addedAtMs: number`
- `fileRef: string` (implementation-specific reference to OPFS/IndexedDB blob)
- optional: `coverRef`, `spineIndex`, etc.

### `ProgressLocal`

- `bookFingerprint: string`
- `chapterId: string`
- `sentenceIndex: number`
- `markerId: string`
- optional: `ttsVoice?: string`
- optional: `ttsRate?: number`
- `updatedAtMs: number`

## Remote storage (Google Drive appDataFolder)

Stored as a single JSON file.

### Filename

- `epub-reader-progress-v1.json`

### JSON schema (v1)

```json
{
  "version": 1,
  "updatedAtMs": 0,
  "books": {
    "<bookFingerprint>": {
      "chapterId": "…",
      "sentenceIndex": 0,
      "markerId": "…",
      "ttsVoice": "…",
      "ttsRate": 1.0,
      "updatedAtMs": 0
    }
  }
}
```

## Migration

- Any incompatible change bumps `version`.
- Migration rules must be documented before release.

