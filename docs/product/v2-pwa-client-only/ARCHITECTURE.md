# Architecture — v2 PWA Client-only

## Overview

v2 is **client-only** and **offline-first**:

- Books/EPUB content is stored **locally** (device storage).
- Reading progress is stored **locally** and optionally synced to Google Drive `appDataFolder`.
- The **reader pipeline remains the same as v1** (chapter XHTML rendering + sentence markers + TTS/highlighting). Only the storage and sync layers change.

## Components

- **PWA UI (Next.js)**
  - Bookshelf
  - Reader + TTS
  - Sync settings (optional)
- **Local storage**
  - EPUB file storage: OPFS (preferred) or IndexedDB fallback
  - Metadata + progress: IndexedDB (Dexie)
- **Google Identity Services (optional)**
  - OAuth token for Drive scope `drive.appdata`
- **Google Drive `appDataFolder`**
  - Stores a single JSON file containing progress records per book fingerprint

## Data flow (high-level)

1) Import book → compute `bookFingerprint` → store EPUB locally → store metadata locally
2) Reader updates progress → write to local DB immediately
3) If Drive sync is connected:
   - Debounced writes push progress to Drive
   - On app start / book open: pull remote progress and merge into local

## Trust boundaries

- Book content: **never leaves device**
- Remote: progress JSON only (minimal personal data)

