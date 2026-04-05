# Issue #62 Continuation Prompt: Pick Up Where We Left Off

Use this as the handoff prompt for continuing work on:
https://github.com/knightedcodemonkey/develop/issues/62

## Prompt

You are resuming implementation for issue #62 in `@knighted/develop`.

### Goal

Finish the dynamic multi-tab workspace/editor refactor and close remaining
behavior gaps without doing a broad visual redesign.

### Current project constraints

- Keep changes localized to `@knighted/develop`.
- Preserve CDN-first runtime/fallback behavior.
- Preserve existing lint/build pipeline.
- Do not add dependencies without asking first.
- Prefer focused, minimal diffs over broad rewrites.

### What is already done

- Dynamic workspace tabs exist with add, rename, remove, and local persistence.
- Entry-role guard exists (entry tab cannot be removed).
- Tab strip was moved to a dedicated full-width row in the editor area.
- Tab visuals were updated toward IDE-like tabs.
- Rename flow was hardened against re-entrant render races.
- Add-tab naming prompt was removed in favor of generated default names.
- Active tab is re-applied on startup to reduce initial-load drift.
- Focus-based kind switching was removed from editor focus handlers.
- `setActiveWorkspaceTabForKind` has been removed.
- Lint/build were passing after the most recent structural change.

### Known remaining risk areas

- Residual component/styles lane assumptions still exist in `src/app.js`
  (for example cached loaded tab ids and kind-based branches).
- App entry tab selection on initial load has historically been flaky.
- Remove-tab fallback and active-tab/editor sync should stay strictly
  tab-id-driven.
- Preview entry/hydration behavior must remain consistent with tab metadata.

### Required outcomes for this continuation

1. Make active tab id the single source of truth

- Eliminate or isolate remaining lane-coupled activation logic.
- Ensure selecting a tab always controls visible editor content.

2. Preserve entry contract and startup determinism

- Entry tab path should remain `src/components/App.tsx` or `src/components/App.jsx`.
- On first load/restore, App entry tab must be selectable and render correctly.

3. Keep one-visible-editor behavior stable

- Only one editor panel should be visible at a time.
- Internal pooling can remain, but hidden editor focus/state must not mutate
  active tab.

4. Keep remove/add/rename flows coherent

- Remove fallback must be deterministic and tab-first.
- Rename/add should not produce stale active state or content drift.

5. Clean dead branches introduced during migration

- Remove obsolete helpers and stale wiring once replacement paths are active.
- Remove only clearly dead CSS/DOM hooks tied to removed behavior.

### Suggested execution sequence

1. Audit active-tab flow in `src/app.js`:

- `setActiveWorkspaceTab`
- `loadWorkspaceTabIntoEditor`
- remove-tab fallback logic
- startup restore logic

2. Convert remaining kind-branch activation to tab-id-first selection.

3. Re-test high-risk interactions manually:

- initial load with App entry tab
- select between multiple component and style tabs
- add tab, rename tab, remove non-entry tab
- switch style modes and verify preview keeps rendering

4. Run validation:

```bash
npm run lint
npm run build
```

5. If behavior changed, update docs briefly in `docs/`.

### Definition of done

- App entry tab is reliably selectable on initial load.
- No hidden-focus path can override active tab unexpectedly.
- Active tab, visible editor, and persisted content stay in sync.
- Remove/add/rename flows are stable and deterministic.
- Lint/build pass.
