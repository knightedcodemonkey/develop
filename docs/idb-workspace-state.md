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
