# Security & Privacy — v2

## Privacy commitments

- EPUB/book contents remain **on-device only**.
- Remote sync stores **progress only** (chapter/sentence/marker + TTS settings).

## Google Drive storage

- Uses Google Drive `appDataFolder` (hidden).
- Stored data is a small JSON file (versioned schema).

## Token handling

- OAuth access token must be treated as sensitive.
- Prefer short-lived tokens and re-auth when required.
- Disconnect should stop syncing immediately.

## User controls

- Sync is opt-in.
- Provide a visible disconnect option.
- Communicate clearly what data is synced and what is not.

