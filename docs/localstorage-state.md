# localStorage State Ownership

This document is the source of truth for what `@knighted/develop` stores in `localStorage`.

## Allowed Keys

`localStorage` is intentionally limited to lightweight user preference/session keys:

1. `knighted:develop:github-pat`
   - GitHub personal access token used for API calls.
2. `knighted-develop:render-mode`
   - Last selected render mode (`dom` or `react`).
3. Theme/UI preference keys managed by layout theme modules.

## Not Allowed In localStorage

Do not store pull request context in `localStorage`.

Examples that must stay out of `localStorage`:

- Selected repository preference (`owner/repo`)
- PR context state (`active`, `disconnected`, `closed`, `inactive`)
- PR number and URL
- PR base/head/title/body
- PR drawer repository-scoped workflow state
- Workspace tab snapshots and synced file metadata

## Design Rule

`localStorage` is for lightweight bootstrap preferences only.

If data is needed to restore workspace or pull request workflow state, it belongs in IndexedDB workspace records.

Repository selection is derived from in-memory BYOT controls and IndexedDB-backed workspace records, not from a dedicated localStorage key.
