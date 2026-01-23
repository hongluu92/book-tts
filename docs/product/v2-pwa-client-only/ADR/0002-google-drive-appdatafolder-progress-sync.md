# ADR 0002: Google Drive appDataFolder for progress sync

## Status

Accepted

## Context

We need cross-device sync for **progress only**, without uploading book contents, and without running our own backend.

## Decision

Use Google Drive **`appDataFolder`** as the remote store:

- OAuth scope: `https://www.googleapis.com/auth/drive.appdata`
- Store a single JSON file: `epub-reader-progress-v1.json`
- Use last-write-wins by `updatedAtMs` per book record

## Consequences

- Users must optionally connect a Google account to enable sync
- We must handle token expiry and offline gracefully
- This approach keeps book content on-device while enabling lightweight progress sync

