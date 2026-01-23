# SPEC — v2 PWA Client-only (Offline-first + Optional Drive Sync)

## 1) Problem statement

The app should work fully on-device as a PWA (offline-first). Users can import and read EPUB files locally. Some users want to sync their **reading progress** across multiple devices without uploading book contents.

## 2) Goals

- Offline-first PWA reading experience
- Import and store EPUBs **locally only**
- Keep the **reader pipeline the same as v1** (chapter XHTML rendering + sentence markers + TTS/highlight), only replacing storage/sync layers
- Track progress at:
  - `chapterId`
  - `sentenceIndex`
  - `markerId`
  - optional: `ttsVoice`, `ttsRate`
- Optional Google login to sync progress across devices via Google Drive `appDataFolder`

## 3) Non-goals

- No custom backend services required for v2
- No syncing / uploading of EPUB or book content to cloud
- No book sharing between users/accounts

## 4) Users & personas

- Offline reader: never logs in; reads local books only.
- Multi-device reader: connects Google Drive to sync progress only.

## 5) User stories

- As a user, I can import an EPUB file and read it offline.
- As a user, I can close the app and continue reading from my last position on the same device.
- As a user, I can optionally connect Google Drive to sync progress.
- As a user, after importing the same book on a second device, the app restores the latest progress automatically.

## 6) Functional requirements

### 6.1 Library (local-only)

- Import EPUB from device file picker.
- Store EPUB locally (IndexedDB/OPFS).
- Display bookshelf from local library.

### 6.2 Reader

- Load chapters locally (same chapter/XHTML-based reader approach as v1).
- Sentence-level markers are preserved to support highlighting + TTS.
- Save progress locally continuously (best-effort).

### 6.3 Progress sync (optional)

- A “Connect Google Drive” entry point.
- When connected:
  - Pull remote progress
  - Merge with local progress
  - Push local updates (debounced)
- Manual “Sync now” (optional, UX-driven)

## 7) Non-functional requirements

- Privacy-first: book contents never leave the device.
- Resilience: sync failures must not block reading UX.
- Performance: fingerprinting must be fast enough for mobile devices.

## 8) Edge cases & conflict policy

- If two devices update progress for the same book:
  - Resolve using **last-write-wins** by `updatedAtMs`.
- Offline changes are queued locally and synced when online.
- Token expiry/revocation results in a disconnected state; user can reconnect.

## 9) Acceptance criteria (high-level)

- App is usable offline after install.
- Import book → read → progress resumes on same device.
- Connect Drive on device A, read, then on device B (after importing same book) progress restores to the latest known position.
- Disconnect stops remote sync; reading continues locally.

