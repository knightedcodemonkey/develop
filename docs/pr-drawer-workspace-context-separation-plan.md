# PR Drawer vs Workspace Contexts Separation Plan

## Purpose

Define a post-4C UX split so transactional GitHub actions stay focused while local-first workspace lifecycle actions move to a dedicated surface.

## Problem Statement

The current Open Pull Request drawer mixes two distinct concerns:

1. Transactional sync actions:
   - Open pull request
   - Push commit to active pull request
2. Workspace lifecycle management:
   - Select/search local contexts
   - Remove local contexts

This creates cognitive overhead and makes destructive local operations feel coupled to one-shot GitHub actions.

## Goals

1. Keep PR drawer focused on transactional actions and immediate status.
2. Move workspace lifecycle operations to a dedicated context management surface.
3. Preserve local-first behavior and IndexedDB as source of truth for workspace content.
4. Keep migration incremental and avoid breaking existing flows.

## Product Decisions (Locked)

The following decisions are accepted for implementation:

1. Add a dedicated `Workspaces` control button in `app-grid-ai-controls`.
2. `Workspaces` opens its own drawer for lifecycle operations (search/select/remove and future context features).
3. Open PR / Push commit flows no longer expose `Component filename` and `Styles filename` fields.
4. Commit target filenames are derived from workspace tab metadata stored in IndexedDB.
5. The checkbox currently labeled `Include App wrapper in committed component source` will be relabeled to reflect entry-tab semantics.
6. Open PR / Push commit confirmation summary shifts from two fixed file fields to a mapped tab/file list.

## Proposed Information Architecture

### 1. PR Drawer (Transactional)

Keep only action-scoped fields and status:

1. Repository and branch selection
2. File mapping summary derived from workspace tab metadata
3. PR title/body and commit message
4. Submit actions (Open PR, Push commit)
5. Transaction status/errors

Optional shortcut:

1. Current context selector (read-focused quick switch)
2. Link/button to open full context manager

### 2. Workspace Context Manager (Lifecycle)

Dedicated UI surface (modal or side panel) for:

1. Search/filter local contexts
2. Select/activate local context
3. Remove one or many local contexts
4. Future: open PR binding and context metadata management

Location and trigger:

1. Triggered from a new `Workspaces` button in `app-grid-ai-controls`.
2. Implemented as a dedicated drawer separate from the PR drawer.
3. Uses a colocated module structure under a parent directory dedicated to workspace lifecycle UI.

## Storage Boundaries (Unchanged)

1. IndexedDB:
   - Workspace tabs and content
   - Tab sync metadata (dirty/synced markers)
   - Workspace context records
2. localStorage:
   - User preferences
   - Lightweight per-repo PR drawer config

## Migration Plan

### Phase A: Transitional (Low Risk)

1. Add `Workspaces` button in `app-grid-ai-controls` with dedicated icon.
2. Add standalone `Workspaces` drawer skeleton and lifecycle list rendering.
3. Move search/remove controls from PR drawer into `Workspaces` drawer.
4. Keep quick context selection in PR drawer only as an optional shortcut.

### Phase B: Consolidation

1. Reduce PR drawer context UI to active context summary + switch shortcut.
2. Remove component/styles filename fields from PR drawer.
3. Derive commit file targets exclusively from workspace tab metadata in IndexedDB.
4. Add multi-select removal and richer filters in manager.

### Phase C: Follow-up Enhancements

1. Open PR list binding tools live in manager.
2. Context health indicators (dirty, synced, drift) appear in manager list.
3. Optional pin/favorite/recents support.
4. Optional tab-level include/exclude toggles for commit targets (if needed by workflow feedback).

## Confirmation Summary Contract (Open PR / Push Commit)

The confirmation dialog should show:

1. Repository (`owner/repo`)
2. Branch information:
   - Open PR: `Base` and `Head`
   - Push commit: `Head`
3. Commit message
4. A commit target list derived from tab metadata:
   - Tab display name
   - Repository-relative filepath
   - Optional tag for entry tab

Recommended rendering:

1. Keep the top metadata lines concise.
2. Show a bulleted list for `Files to commit` so users can quickly scan exact targets.
3. For long lists, cap visible rows and show `+N more` summary.

## Accessibility and UX Requirements

1. Dedicated manager must support keyboard navigation for list/select/remove.
2. Destructive actions must require explicit confirmation.
3. PR drawer status remains transactional only.
4. Context manager explains local-only deletion scope clearly.

## Testing Plan

1. PR drawer tests verify transactional workflows independent of context cleanup.
2. Context manager tests verify search/select/delete workflows.
3. Migration test verifies existing users retain contexts after UI split.

## Open Decisions

1. Modal vs side panel for context manager.
2. Whether quick-select remains in PR drawer after Phase B.
3. Whether context removal supports undo window.
4. Whether the PR drawer should show all mapped tabs or only tabs marked as commit-included.

## Implementation Structure Guidance

To keep implementation modular and colocated:

1. Create a parent module directory for lifecycle UI, for example:
   - `src/modules/workspaces-drawer/`
2. Keep small focused modules inside it, for example:
   - `drawer.js` (controller)
   - `state.js` (view state)
   - `list-render.js` (UI rendering)
   - `actions.js` (select/remove commands)
3. Keep PR transactional logic in existing PR modules and consume workspace metadata via adapter functions only.

## UI Copy Updates

1. Rename checkbox label:
   - From: `Include App wrapper in committed component source`
   - To: `Include entry tab source in committed output`
2. In summaries and status, refer to `entry tab` and `workspace files` rather than `component/styles files`.

## Suggested Rollout

1. Land after 4C stabilization tests are green.
2. Ship Phase A first, then Phase B in follow-up PR.
