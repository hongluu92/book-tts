# UX Flows — v2

## Bookshelf

### Local-only default

- User can import EPUB and start reading without any login.
- Bookshelf shows local library and “Continue reading” based on local progress.

### Optional sync

- Provide a clear entry point:
  - “Connect Google Drive (sync progress)”
- Show status:
  - Connected / Disconnected
  - Last sync time (optional)
  - Error state with retry

## Reader

- Progress saved locally continuously.
- Sync should not interrupt reading.

## Sync UX principles

- Always usable offline.
- Sync is best-effort; failures are non-blocking.
- Make it obvious that **book content is not uploaded**, only progress.

