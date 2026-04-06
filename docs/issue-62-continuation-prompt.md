# Issue #62 Continuation Prompt: Remaining Hardening Scope

Use this as the handoff prompt for any remaining work related to:
https://github.com/knightedcodemonkey/develop/issues/62

## Prompt

You are continuing issue #62 in `@knighted/develop` after the main multi-tab
workspace refactor is already complete.

### Goal

Harden the current tab-id-first workspace/editor behavior and close any
remaining edge-case regressions without broad UI redesign.

### Current project constraints

- Keep changes localized to `@knighted/develop`.
- Preserve CDN-first runtime/fallback behavior.
- Preserve existing lint/build/test pipeline.
- Do not add dependencies without asking first.
- Prefer focused, minimal diffs over broad rewrites.

### What is already complete

- Dynamic workspace tabs are in place (add/rename/remove) with persistence.
- Entry-role guard is in place (entry tab cannot be removed).
- Entry filename contract is enforced (`App.tsx` or `App.js`).
- One-visible-editor behavior is in place with tab-driven visibility.
- Full Playwright suite was passing after test cleanup and refactor alignment.

### Remaining focus areas

1. Tab-id-first activation hardening

- Keep active tab id as the single source of truth for visible editor content.
- Prevent hidden-panel interactions or stale branch logic from mutating active tab state.

2. Entry and startup determinism

- Verify entry tab restore and initial-load selection remain stable.
- Keep preview entry resolution aligned with tab metadata (`role: entry`) and documented fallback behavior.

3. Remove/add/rename coherence

- Keep fallback tab selection deterministic after remove.
- Ensure add and rename flows do not drift name/path/content synchronization.

4. Dead migration branch cleanup

- Remove clearly obsolete helper paths or style/DOM hooks that are no longer used.
- Avoid speculative cleanup outside touched areas.

5. Workspace import specifier compatibility

- Support ESM-style runtime specifiers for workspace modules (for example importing
  `./src/components/module.js` from an underlying `.ts`/`.tsx` tab when appropriate).
- Keep resolution deterministic: exact-match path first, extension-compat fallback second,
  with explicit handling for ambiguous matches.

6. Extension-driven tab kind detection

- Ensure new tabs can be created as CSS tabs without relying on active-tab lane assumptions.
- Add flow should expose explicit editor type selection (`Component`, `Styles`, `Auto`)
  so users can disambiguate toolsets at creation time.
- Infer tab kind from filename extension/path when adding or renaming tabs
  (for example `.css`, `.less`, `.sass` -> styles tab behavior).
- `Auto` should infer from extension, while explicit user selection should override inference.
- Keep editor language, tools, and render pipeline wiring aligned with inferred tab kind.

### Suggested execution sequence

1. Audit high-risk flows in `src/app.js`:

- `setActiveWorkspaceTab`
- `loadWorkspaceTabIntoEditor`
- remove-tab fallback logic
- startup restore path

2. Confirm entry resolution consistency with `src/modules/preview-entry-resolver.js`.

3. Re-test high-risk interactions:

- first load/restore with entry tab
- tab switching across component and style tabs
- add tab, rename tab, remove non-entry tab
- style mode switches with preview render continuity
- importing workspace modules via `.js` specifiers when source tabs are `.ts`/`.tsx`
- creating and renaming tabs with style extensions to verify styles-tab behavior

4. Run validation:

```bash
npm run lint
npm run build
npm run test:e2e
```

5. Update docs only if behavior contract changes.

### Definition of done

- Active tab id, visible editor, and persisted content remain synchronized.
- Entry tab is stable on startup and remains renderable.
- Remove/add/rename flows are deterministic under rapid interaction.
- Workspace import resolution supports documented ESM-style extension compatibility.
- New tab behavior correctly recognizes style-file extensions and routes to styles semantics.
- No stale migration branches remain in touched code.
- Lint/build/e2e pass.
