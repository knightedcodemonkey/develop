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
  - `prContextState`: `inactive` | `active` | `disconnected` | `closed`
  - `prNumber`: `number | null`
  - `prTitle`, `base`, `head`
  - `repo`

### localStorage

- Not used for PR context state.
- No legacy PR-context migration/cleanup path is supported.

## Status Matrix

Use this matrix as the source of truth when debugging UI/storage mismatch.

| Scenario                                      | IDB `prContextState` | IDB `prNumber`                    | localStorage PR fields | Notes                                                       |
| --------------------------------------------- | -------------------- | --------------------------------- | ---------------------- | ----------------------------------------------------------- |
| A. Local workspace only, no PR context        | `inactive`           | `null`                            | none                   | No connected PR context.                                    |
| B. Workspace is for an active, open PR        | `active`             | PR number                         | none                   | Push mode in PR controls.                                   |
| C. Workspace is for a disconnected PR context | `disconnected`       | last known PR number if available | none                   | PR may still be open on GitHub; reconnect can verify later. |
| D. Workspace is for a PR closed on GitHub     | `closed`             | closed PR number                  | none                   | Historical context retained for debugging/reference.        |

## Current Workspace Selection On Load

When the app loads or the selected repository changes, the app selects a workspace from IndexedDB using repository-scoped records only.

Selection order:

1. Load records for the currently selected repository (`repo` match).
2. Compute a preferred id from in-memory state:

- Existing in-memory active record id when available.
- Otherwise canonical id derived from current repository + head.

3. If the preferred record exists and is `active`, select it.
4. Otherwise select the first `active` record in that repository.
5. Otherwise select the preferred record if present.
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
2. Compare against the matrix above.
3. If scenario C is expected, remember GitHub-open verification is deferred until reconnect flow is invoked.

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

## Current Limitation

Reconnect behavior from the Workspaces drawer is not implemented yet. This document defines the storage contract needed to support that workflow reliably.
