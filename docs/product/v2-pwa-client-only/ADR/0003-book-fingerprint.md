# ADR 0003: Book fingerprint for cross-device mapping

## Status

Accepted

## Context

In v2 there is no backend `bookId`, and book content is local-only. We need a stable identifier that allows mapping the same book across devices to apply synced progress correctly.

## Decision

Compute a `bookFingerprint` as:

- `sha256(fileSizeBytes + first64KB + last64KB)`
- Fallback: `sha256(fileSizeBytes + first64KB)` if last chunk is not available

Use `bookFingerprint` as the key in:

- Local DB (progress, metadata)
- Remote progress JSON file

## Consequences

- Import time includes hashing cost (bounded by 128KB read + hashing)
- Renaming the file does not break mapping (content-based)
- Different editions/files will have different fingerprints (avoids incorrect progress mapping)

