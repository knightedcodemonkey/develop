# PR Drawer vs Workspace Contexts Remaining Backlog

This document now tracks only work not yet implemented from the original separation plan.

## Completed (for context)

1. Workspaces button and dedicated Workspaces drawer exist.
2. PR drawer no longer exposes component/styles filename inputs.
3. Commit targets are derived from workspace tab metadata.
4. Checkbox copy uses entry-tab language.
5. Confirmation summary includes a Files to commit list.

## Remaining Work

### Phase B follow-up

1. Add multi-select removal in Workspaces drawer.
2. Add richer filtering in Workspaces drawer.
3. Decide whether to keep a quick context-switch affordance in PR drawer.

### Phase C enhancements

1. Add open PR binding tools to Workspaces drawer.
2. Add context health indicators in the Workspaces list (dirty, synced, drift).
3. Add optional pin/favorite/recents support.
4. Evaluate optional tab include/exclude toggles for commit targets.

### Confirmation summary UX polish

1. For long file lists, cap visible rows and show a +N more summary.

### Modularization follow-up

Current implementation is primarily `src/modules/workspaces-drawer/drawer.js`.

1. Split module if needed into smaller units:
   - `state.js`
   - `list-render.js`
   - `actions.js`
2. Keep PR transactional logic isolated in PR modules.

## Validation Coverage to Keep

1. PR drawer tests remain focused on transactional workflows.
2. Workspaces drawer tests cover search/select/delete and future multi-select behavior.
3. Migration tests ensure existing stored contexts are retained.
