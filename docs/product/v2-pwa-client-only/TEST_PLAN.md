# Test Plan — v2

## Goals

Validate offline-first behavior, local-only storage, and optional progress sync across devices.

## Scenarios

### 1) Offline reading

- Install PWA
- Import EPUB
- Enable airplane mode
- Verify:
  - Bookshelf loads local library
  - Reader works and progress updates locally

### 2) Same-device resume

- Read to a new position
- Close/reopen app
- Verify resume to last saved progress

### 3) Multi-device sync (happy path)

- Device A: connect Google Drive, read to position P1
- Device B: connect same Google account, import the **same EPUB**, open book
- Verify device B resumes at P1

### 4) Conflict resolution

- Device A and B both read the same book to different positions while offline
- Reconnect both to network
- Verify **last-write-wins** behavior by `updatedAtMs`

### 5) Token expiry / revoke

- Revoke app access from Google account settings
- Verify app transitions to disconnected state without breaking reading

