# Google Drive Sync — v2 (Progress only)

## Scope & principle

- Sync only **progress + minimal settings**, never book content.
- Google login is **optional** and only needed to enable sync.

## OAuth

- Provider: Google Identity Services
- Required scope: `https://www.googleapis.com/auth/drive.appdata`
- Token should be treated as sensitive; sync must degrade gracefully when unavailable.

## Storage location

- Google Drive `appDataFolder` (hidden app storage)
- Single JSON file: `epub-reader-progress-v1.json`

## Sync protocol (recommended)

### Pull

- On connect, app start, and/or on book open:
  - Download remote file
  - Read record for `bookFingerprint`

### Merge (per book)

- Compare local `updatedAtMs` vs remote `updatedAtMs`
- **Last-write-wins**
  - If remote is newer: apply remote to local
  - If local is newer: keep local

### Push

- On progress updates:
  - Save locally immediately
  - Debounce remote write (e.g. 3 seconds)
  - Upsert record for `bookFingerprint`

## Failure handling

- Offline: queue local changes; retry when online
- Token expired: attempt silent refresh; if failed, show disconnected state
- Rate limits / transient errors: retry with backoff

