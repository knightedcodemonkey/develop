# PR Context Storage Matrix

How `@knighted/develop` stores pull request context across browser storage.

This guide focuses on two storage surfaces:

1. **IndexedDB (IDB)**: workspace snapshots used by the Workspaces drawer.
2. **localStorage**: repository-scoped PR drawer context metadata.

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

- Key pattern: `knighted:develop:github-pr-config:<owner>/<repo>`
- Relevant fields in each config:
  - `isActivePr`: `boolean`
  - `prContextState`: `inactive` | `active` | `disconnected` | `closed`
  - `pullRequestNumber`: `number | null`
  - `pullRequestUrl`: `string`
  - `prTitle`, `baseBranch`, `headBranch`

## Status Matrix

Use this matrix as the source of truth when debugging UI/storage mismatch.

| Scenario                                      | IDB `prContextState` | IDB `prNumber`                    | localStorage `isActivePr` | localStorage `prContextState` | Notes                                                       |
| --------------------------------------------- | -------------------- | --------------------------------- | ------------------------- | ----------------------------- | ----------------------------------------------------------- |
| A. Local workspace only, no PR context        | `inactive`           | `null`                            | `false` (or no key)       | `inactive` (or no key)        | No connected PR context.                                    |
| B. Workspace is for an active, open PR        | `active`             | PR number                         | `true`                    | `active`                      | Push mode in PR controls.                                   |
| C. Workspace is for a disconnected PR context | `disconnected`       | last known PR number if available | `false`                   | `disconnected`                | PR may still be open on GitHub; reconnect can verify later. |
| D. Workspace is for a PR closed on GitHub     | `closed`             | closed PR number                  | `false`                   | `closed`                      | Historical context retained for debugging/reference.        |

## Why Both IDB And localStorage Exist

The two stores have different responsibilities:

1. **IDB (workspace scope)**
   - Persists full editor/workspace snapshots.
   - Drives Workspaces drawer restore and switching.
2. **localStorage (repository PR scope)**
   - Persists PR drawer config and active context metadata for the selected repository.
   - Drives Open PR vs Push mode and active-context checks.

They intentionally overlap on PR metadata so the app can restore workspace context and PR drawer behavior across reloads.

## Debugging Checklist

When the UI does not match expected PR state:

1. Check localStorage key for the selected repository and inspect:
   - `isActivePr`
   - `prContextState`
   - `pullRequestNumber`
2. Check IDB workspace record currently selected/opened and inspect:
   - `prContextState`
   - `prNumber`
   - `repo`, `head`, `prTitle`
3. Compare against the matrix above.
4. If scenario C is expected, remember GitHub-open verification is deferred until reconnect flow is invoked.

## Console Snippets

LocalStorage (selected repo key):

```js
JSON.parse(localStorage.getItem('knighted:develop:github-pr-config:OWNER/REPO') || '{}')
```

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
