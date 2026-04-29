# IndexedDB Workspace State Ownership

This document is the source of truth for what `@knighted/develop` stores in IndexedDB.

## Storage Location

- Database: `knighted-develop-workspaces`
- Object store: `prWorkspaces`

## Canonical State In IDB

IndexedDB is the canonical source for workspace and pull request context.

Each workspace record may include:

- Workspace identity and timing:
  - `id`
  - `createdAt`
  - `lastModified`
  - `workspaceScope` (`local` | `repository`)
- Repository and PR context:
  - `repo`
  - `base`
  - `head`
  - `prTitle`
  - `prNumber`
  - `prContextState` (`inactive` | `active` | `closed`)
- Runtime/editor state:
  - `renderMode`
  - `activeTabId`
  - `tabs[]` including content, dirty state, sync metadata, and file paths

## Why IDB Is Canonical

Workspace restore and PR workflow continuity require structured, durable records.

IDB supports that by storing:

- Full workspace snapshots
- Repo-scoped context records
- Historical transitions such as closed PR context

## Design Rule

If a value is required to accurately restore PR/workspace behavior after reload, it must live in IDB records.

`localStorage` should only mirror user preferences and lightweight bootstrap values.

## Post-Push Baseline Invariant

After a successful Push Commit action for an active PR workspace:

- The active workspace record must persist immediately in IDB.
- Any committed tab path returned by push updates must persist with:
  - `isDirty = false`
  - `syncedContent = content`
  - `syncedAt` updated to the push/reconcile time
  - `lastSyncedRemoteSha` set when a commit SHA is available
- The same clean baseline must survive a full page reload.

Dirty-state note:

- When `syncedContent` is present for a tab, canonical dirty state is derived from
  `content !== syncedContent`.
- This prevents stale UI-only dirty flags from overriding persisted sync baseline truth.

## Behavioral Spec

For action-level drawer semantics and state machine behavior, see:

- `docs/workspaces-behavior-algorithm.md`
