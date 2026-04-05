# Full Pass Refactor Prompt: Workspace-First Editor + UI Cleanup

Use this document as the implementation prompt for a full-pass refactor of
`@knighted/develop` editor workspace UX and runtime wiring.

## Prompt

You are refactoring `@knighted/develop` in one cohesive pass.

### Primary objective

Deliver a clean, workspace-first editor architecture with dynamic tabs and a
single generalized editor model, then remove obsolete code and CSS. Do not
keep transitional compatibility layers unless required for current behavior.

### Product direction

- The app has editor panel(s) and a preview panel.
- Do not model the editor UI as fixed "Component panel" and "Styles panel".
- Tabs are the source of truth for editor content and editor identity.
- Entry behavior is tab metadata-driven (`role: entry`) rather than filename
  heuristics alone.
- Default workspace includes an entry tab (`src/components/App.tsx`) and a
  style tab (`src/styles/app.css`).

### Required outcomes

1. Generalized editor model

- Replace component/styles-specific control flow with a generalized editor-tab
  flow where possible.
- Keep legacy identifiers only where integration boundaries require them, and
  document each remaining boundary.

2. Tab UX completeness

- Selecting any tab always reveals the correct editor content.
- Add flow supports explicit custom tab naming at creation time.
- Rename is first-class and discoverable (not hidden-only gesture).
- Tab remove behavior is consistent and guarded for `entry` role.

3. Editor panel behavior

- Default behavior: one active editor visible.
- Architecture allows future expansion to dual editor view (pin/split) without
  major rewrites.

4. Preview consistency

- Preview uses the resolved entry tab and workspace dependency hydration.
- Error states are surfaced clearly (no silent blank preview when avoidable).

5. CSS and DOM cleanup

- Remove obsolete selectors, dead classes, and stale panel-specific style
  branches introduced by transition work.
- Remove styles and markup that no longer map to active UI behavior.
- Keep naming consistent with the new generalized model.

6. State and persistence cleanup

- Workspace state should be centered on IndexedDB-backed workspace records.
- Remove or minimize stale localStorage-driven UI context persistence where it
  is no longer aligned with the new model.
- Preserve only local storage that is still intentionally in scope (for
  example token storage) and document why.

### Refactor constraints

- Keep changes focused to `@knighted/develop`.
- Preserve CDN-first runtime behavior.
- Preserve current lint/build/test pipelines.
- Prefer replacing old code over layering additional compatibility logic.
- Avoid broad visual rewrites unrelated to workspace/editor architecture.

### Cleanup policy

For every modified area:

- Delete dead code in the same pass.
- Delete unreachable CSS in the same pass.
- Delete unused DOM hooks in the same pass.
- Delete stale helper functions once call sites are migrated.
- Do not leave TODO-only transition stubs unless explicitly necessary.

### Validation checklist (must run)

```bash
npm run lint
npm run build
```

If UI interactions changed materially, run relevant Playwright coverage for
workspace tabs and preview rendering paths.

### Deliverables

1. Refactored implementation in `src/` and related modules.
2. Removed obsolete code and CSS (not just deprecated).
3. Updated docs for any behavior/workflow changes.
4. Short migration summary including:

- What was removed.
- What remains intentionally legacy and why.
- Follow-up items only if truly blocked.

### Acceptance criteria

- No known bug where selecting an entry tab fails to show its editor.
- No permanently hidden primary editor panel due to stale panel assumptions.
- Users can name tabs on add and rename any non-restricted tab directly.
- CSS does not include obvious dead/legacy panel-era branches.
- Lint/build pass.

## Suggested execution order

1. Stabilize editor visibility and tab activation semantics.
2. Generalize editor model and panel naming in code.
3. Migrate add/rename/remove flows to final UX.
4. Remove stale component/styles-specific branches and dead CSS.
5. Re-run validation and update docs.
