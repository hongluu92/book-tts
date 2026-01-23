# ADR 0001: Client-only (No custom backend)

## Status

Accepted

## Context

We want a PWA that works offline-first and does not require operating a backend service. Books must remain on-device only.

## Decision

Implement v2 as a **client-only** app. Any optional sync uses a managed third-party storage (Google Drive `appDataFolder`) and only stores reading progress.

## Consequences

- Simpler ops: no backend deployment/maintenance
- Requires careful local storage and conflict handling
- Cross-device sync must not depend on server-issued book IDs

