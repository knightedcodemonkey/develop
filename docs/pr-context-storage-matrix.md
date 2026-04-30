# PR Context Storage Matrix

How `@knighted/develop` stores pull request context across browser storage.

This guide focuses on PR-context ownership only.

PR context is stored in one place:

1. **IndexedDB (IDB)**: workspace snapshots used by the Workspaces drawer.

See the full storage ownership docs for non-PR keys:

- [localstorage-state.md](localstorage-state.md)
- [idb-workspace-state.md](idb-workspace-state.md)

## Storage Surfaces

### IndexedDB

- Database: `knighted-develop-workspaces`
- Object store: `prWorkspaces`
- Relevant fields in each workspace record:
  - `prContextState`: `inactive` | `active` | `closed`
  - `prNumber`: `number | null`
  - `prTitle`, `base`, `head`
  - `repo`

### localStorage

- Not used for PR context state.
- No legacy PR-context migration/cleanup path is supported.

## Status Matrix

Use this matrix as the source of truth when debugging UI/storage mismatch.

| Scenario                                   | IDB `prContextState` | IDB `prNumber`   | localStorage PR fields | Notes                                                                                                           |
| ------------------------------------------ | -------------------- | ---------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| A. Local workspace only, no PR context     | `inactive`           | `null`           | none                   | No connected PR context.                                                                                        |
| B. Workspace is for an active, open PR     | `active`             | PR number        | none                   | Push mode in PR controls.                                                                                       |
| C. Workspace is for a PR closed on GitHub  | `closed`             | closed PR number | none                   | Historical context retained for debugging/reference.                                                            |
| D. Active PR immediately after push commit | `active`             | PR number        | none                   | Committed tabs persist clean baseline (`isDirty=false`, `syncedContent=content`) and remain clean after reload. |

## Current Workspace Selection On Load

When the app loads, workspace restore scope depends on whether a repository is selected.

- If a repository is selected: use repository-scoped records only (`repo` match).
- If no repository is selected: evaluate all stored workspace records.

Selection order:

1. Load candidate records using the scope above.
2. Compute preferred candidates from in-memory state:

- Preferred by id: existing in-memory active record id when available.
- Preferred by workspace key: current repository + head (`workspaceKey`).

3. If preferred-by-id or preferred-by-key exists and is `active`, select it.
4. Otherwise select the first `active` record in candidates.
5. Otherwise select preferred-by-id or preferred-by-key if present.
6. Otherwise fall back to the first record returned by IDB ordering.

Notes:

- No `active workspace` pointer is stored in `localStorage`.
- Restore behavior is intentionally derived from IDB workspace records + in-memory runtime state.
- This avoids cross-storage drift between `localStorage` and IndexedDB.

## Why PR Context Lives In IDB Only

PR workflow state is part of workspace state.

Storing it only in IDB avoids drift between storage systems and keeps a single source of truth for restore behavior.

## Debugging Checklist

When the UI does not match expected PR state:

1. Check the IDB workspace record currently selected/opened and inspect:
   - `prContextState`
   - `prNumber`
   - `repo`, `head`, `prTitle`

- committed tab fields: `isDirty`, `syncedContent`, `content`, `syncedAt`, `lastSyncedRemoteSha`

2. Compare against the matrix above.
3. If the PR is still open on GitHub, expect PR controls to return to Push mode and the workspace record to transition back to `active`.
4. If the PR is no longer open, expect Open PR mode to remain and status messaging to explain verification results.

## Console Snippets

IndexedDB (all workspace records):

```js
indexedDB.open('knighted-develop-workspaces').onsuccess = event => {
  const db = event.target.result
  db.transaction('prWorkspaces').objectStore('prWorkspaces').getAll().onsuccess = e => {
    console.log(e.target.result)
  }
}
```

## End-Of-Session Behavior

`Close` is the end-of-session action for PR-linked workspaces.

When close is confirmed:

1. The current workspace is archived as historical (`closed`).
2. The app immediately switches to a fresh local workspace (`inactive`) with a single empty entry tab.
3. Status messaging guides the user to continue locally or reopen a stored workspace from Workspaces.

In the Workspaces drawer, inactive local-only workspace options are prefixed with `local:`.
