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
- Workspace preview runs in iframe with per-tab virtual module scope (no shared-scope hydration concatenation).
- Deterministic workspace graph errors for missing/circular imports are covered.
- Focused Playwright coverage for workspace isolation and preview regressions is in place.
- Auto-render now gates component edits to the active entry dependency graph (unrelated component-module edits do not rerender preview).

### Remaining focus areas

1. Tab-id-first activation hardening

- Keep active tab id as the single source of truth for visible editor content.
- Prevent hidden-panel interactions or stale branch logic from mutating active tab state.

2. Entry and startup determinism

- Verify entry tab restore and initial-load selection remain stable.
- Keep preview entry resolution aligned with tab metadata (`role: entry`) and documented fallback behavior.
- Ensure startup render order cannot race editor hydration (component/styles) and silently use stale defaults.

3. Remove/add/rename coherence

- Keep fallback tab selection deterministic after remove.
- Ensure add and rename flows do not drift name/path/content synchronization.

4. Workspace import specifier compatibility

- Support ESM-style runtime specifiers for workspace modules (for example importing
  `./src/components/module.js` from an underlying `.ts`/`.tsx` tab when appropriate).
- Keep resolution deterministic: exact-match path first, extension-compat fallback second,
  with explicit handling for ambiguous matches.

5. Extension-driven tab kind detection

- Ensure new tabs can be created as CSS tabs without relying on active-tab lane assumptions.
- Add flow should expose explicit editor type selection (`Component`, `Styles`, `Auto`)
  so users can disambiguate toolsets at creation time.
- Infer tab kind from filename extension/path when adding or renaming tabs
  (for example `.css`, `.less`, `.sass` -> styles tab behavior).
- `Auto` should infer from extension, while explicit user selection should override inference.
- Keep editor language, tools, and render pipeline wiring aligned with inferred tab kind.

6. Render cadence and stale-error recovery

- Preserve dependency-aware auto-render gating across add/remove/rename and entry changes.
- Eliminate stale error carryover: previous errors must not persist once source/runtime state is corrected.
- Ensure success transitions always clear prior preview error state and stale diagnostics payloads.
- Confirm blob/module disposal and rerender cleanup cannot preserve stale failing module graphs.

7. React runtime correctness in iframe preview

- Verify React mode event handlers execute against the latest compiled module output.
- Investigate and fix runtime regressions such as `TypeError: Assignment to constant variable` (for example from stale/cached module execution or invalid transform output).
- Ensure React mode uses consistent runtime contracts between transpile options, module prelude, and iframe bootstrap render path.
- Ensure React and DOM mode switching does not leave stale runtime state in the iframe.

### Suggested execution sequence

1. Audit iframe diagnostics pipeline end-to-end:

- `src/modules/preview-runtime/iframe-preview-executor.js` (postMessage/error bridge)
- `src/modules/render-runtime.js` (error normalization/surfacing)
- `src/modules/jsx-transform-runtime.js` and transform diagnostics formatting path

2. Verify active-tab/startup coherence in `src/app.js`:

- `setActiveWorkspaceTab`
- `loadWorkspaceTabIntoEditor`
- remove-tab fallback logic
- startup restore path

3. Confirm entry resolution and module planning consistency:

- `src/modules/preview-entry-resolver.js`
- `src/modules/preview-runtime/virtual-workspace-modules.js`

4. Re-test high-risk interactions:

- first load/restore with entry tab
- tab switching across component and style tabs
- add tab, rename tab, remove non-entry tab
- style mode switches with preview render continuity
- JSX syntax/transform failures still reported as `[jsx] ...`
- iframe runtime exceptions surfaced with stable, non-duplicated messaging
- repeated source edits do not trigger runaway rerender loops or duplicate execution
- unrelated non-entry module edits do not rerender preview unless the module is in the active entry import graph
- correcting an error fully recovers preview output without requiring unrelated edits
- React mode click handlers work reliably after multiple rerenders/mode switches
- importing workspace modules via `.js` specifiers when source tabs are `.ts`/`.tsx`
- creating and renaming tabs with style extensions to verify styles-tab behavior

5. Run validation:

```bash
npm run lint
npm run build
npm run test:e2e
```

6. Update docs only if behavior contract changes.

### Definition of done

- Active tab id, visible editor, and persisted content remain synchronized.
- Entry tab is stable on startup and remains renderable.
- Remove/add/rename flows are deterministic under rapid interaction.
- JSX transform failures are surfaced as `[jsx]` diagnostics with codeframe/help when available.
- Iframe runtime and module errors are surfaced deterministically without duplicate/noisy reporting.
- Render pipeline does not over-execute, and stale error state is fully cleared on valid rerender.
- React mode event handlers execute correctly without stale-cache/runtime corruption errors.
- Workspace import resolution supports documented ESM-style extension compatibility.
- New tab behavior correctly recognizes style-file extensions and routes to styles semantics.
- Lint/build/e2e pass.
