# v2 — PWA Client-only (Source of Truth)

## Summary

Build an **offline-first PWA** where:

- **Books/EPUB content stays on-device** (local-only storage)
- **Google login is optional** and only used to **sync reading progress** across devices
- Reading progress format stays the same (chapter + sentence index + marker + TTS settings)
- Cross-device matching uses a **book fingerprint** (content-based hash)

## Docs map

- Requirements: `SPEC.md`
- Architecture: `ARCHITECTURE.md`
- Data model: `DATA_MODEL.md`
- Offline storage: `OFFLINE_STORAGE.md`
- Google Drive progress sync: `SYNC_GOOGLE_DRIVE.md`
- UX flows: `UX_FLOWS.md`
- Security & privacy: `SECURITY_PRIVACY.md`
- Test plan: `TEST_PLAN.md`
- Decisions (ADRs): `ADR/`

