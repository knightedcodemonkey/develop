# Workspaces Drawer Behavior Algorithm

This document locks in the intended behavior for Workspaces drawer actions.

## Goals

- Keep action semantics explicit and predictable.
- Keep button visibility state-driven and mutually exclusive.
- Preserve workspace restore behavior by persisting state in IndexedDB.

## Core Terms

- `Local` scope: Workspaces whose `workspaceScope` is `local`.
- `Repository` scope: Workspaces whose `workspaceScope` is `repository` and whose `repo` matches the selected repository filter.
- `workspaceKey`: Derived identity key from repository + head branch. Used for matching/preference logic, not for UI policy by itself.

## Required Invariants

1. `Initialize` and `New workspace` must never be visible at the same time.
2. `Local` scope never shows `Initialize`.
3. `Initialize` for non-Local empty scope updates the active workspace in place (no fork).
4. `New workspace` always forks from current editor/runtime state into a new record id.
5. Fork creation must generate a fresh head branch suffix so `workspaceKey` and visible labels are distinct.
6. Any workspace created via `New workspace` must persist with `prContextState = "inactive"`.
7. For `New workspace`, `workspaceScope` is target-dependent:
   - `local` when repository filter is `__local__`
   - `repository` when repository filter is a non-local `owner/repo`

## UI State Machine

State is derived from:

- Selected repository filter (`__local__` vs non-local `owner/repo`)
- Presence of stored workspaces in the selected scope

States:

1. `local-empty`
   - Show: `New workspace`
   - Hide: `Initialize`, workspace select, `Open`, `Remove`
2. `local-with-workspaces`
   - Show: `New workspace`, workspace select, `Open`, `Remove`
   - Hide: `Initialize`
3. `repository-empty`
   - Show: `Initialize`
   - Hide: `New workspace`, workspace select, `Open`, `Remove`
4. `repository-with-workspaces`
   - Show: `New workspace`, workspace select, `Open`, `Remove`
   - Hide: `Initialize`

## Action Semantics

### A) Local + New workspace

- Action: fork current workspace into a new record.
- Persisted updates:
  - `workspaceScope = "local"`
  - `prContextState = "inactive"`
  - `repo = ""`
  - fresh `id`
  - fresh local `head` (suffix-appended)
  - `workspaceKey = local::<fresh-head>`

### B) Non-Local + Initialize (no stored workspaces in selected repository)

- Action: update active workspace in place to selected repository scope.
- Persisted updates on current record:
  - `workspaceScope = "repository"`
  - `repo = <selected owner/repo>`
  - `workspaceKey = <selected owner/repo>::<current head>`
- Must preserve current record id.

### C) Non-Local + New workspace (stored workspaces exist)

- Action: fork current workspace into a new repository-scoped record.
- Persisted updates:
  - `workspaceScope = "repository"`
  - `prContextState = "inactive"`
  - `repo = <selected owner/repo>`
  - fresh `id`
  - fresh repository `head` (suffix-appended from current head)
  - `workspaceKey = <selected owner/repo>::<head>`

## Storage Notes

- Canonical workflow state lives in IndexedDB (`prWorkspaces` records).
- `localStorage` must not own repository/workspace workflow state.

## Regression Coverage Expectations

At minimum, tests should verify:

1. Local `New workspace` creates a new record and distinct local label/key.
2. Non-local empty scope shows only `Initialize` and updates active record in place.
3. Non-local scope with records shows only `New workspace` and forks new record.
4. `Initialize` and `New workspace` never coexist.
