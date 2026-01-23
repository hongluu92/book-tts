# Offline Storage — v2

## Goals

- Store EPUB content **locally only**
- Allow full reading experience offline
- Keep storage implementation robust across browsers (especially mobile)

## Book file storage

### Preferred: OPFS (Origin Private File System)

- Pros: better for large files, stream-based access, less memory pressure
- Cons: browser support differences; needs fallback

### Fallback: IndexedDB (Blob/ArrayBuffer)

- Pros: widely supported
- Cons: large file performance can vary; quota limitations

## Metadata and progress

- Use IndexedDB (Dexie) for:
  - book metadata
  - progress per `bookFingerprint`
  - sync status metadata (optional)

## Offline-first behavior

- Reader must never block on network availability.
- All progress is saved locally first; remote sync (if enabled) is best-effort.

