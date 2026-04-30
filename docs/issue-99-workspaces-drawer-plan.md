# Issue #99 + Workspaces Drawer UX Plan

## Goal

Simplify PR/workspace lifecycle and the Workspaces drawer UX by:

- removing disconnected state and Disconnect action paths
- using workspace terminology in the drawer (not context)
- separating new workspace initialization from workspace selection
- preserving strict explicit intent semantics (no implicit apply/mutation from select changes)

## Decisions

- New workspace is an explicit direct action via a `New workspace` button.
- `New workspace` must work for both repository scopes and `Local`.
- `Open` remains the explicit action for applying an existing stored workspace.
- If the selected repository has no stored workspaces, hide the workspace select and show the new-workspace path.

## Implementation Steps

1. Remove disconnected model paths (Issue #99)

- Remove Disconnect control from UI.
- Remove disconnected event wiring and runtime callbacks.
- Remove disconnected public action paths.
- Normalize legacy `disconnected` records to `inactive` during restore/normalization.

2. Redesign drawer flow

- Replace starter option-in-select behavior with a dedicated `New workspace` button adjacent to repository select.
- Keep workspace select for stored workspaces only.
- Hide workspace select when no stored workspaces exist for the selected scope.
- Keep strict explicit selection semantics (no auto-apply from select/filter changes).

3. Update copy and accessibility

- Replace "Stored contexts" and related "context" wording with "Workspace" wording.
- Update status and aria labels consistently.

4. Remove obsolete code paths

- Remove starter prefix constants and parsing.
- Remove disconnected-only logic and stale styling/branches.

5. Update tests

- Remove/replace disconnected-focused scenarios.
- Update helpers/selectors to new workspace labels and `New workspace` action.
- Add/adjust scenarios for empty repository scope (select hidden) and explicit Open behavior for existing workspaces.

6. Update docs

- Update storage/state docs to remove disconnected semantics.
- Update drawer UX docs to reflect repository row + new workspace action flow.

## Verification

1. `npm run lint`
2. Targeted Playwright (Chromium first):

- `playwright/github-pr-drawer/active-context-switch.spec.ts`
- `playwright/github-pr-drawer/open-pr-create.spec.ts`

3. Broader Playwright run for workspace/PR drawer flows.
4. Manual verification in dev server for:

- repository + new workspace row
- local new workspace creation
- hidden workspace select when no stored entries
- explicit Open required for existing entries
- no Disconnect control
