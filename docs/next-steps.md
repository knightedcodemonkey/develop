# Next Steps

Focused follow-up work for `@knighted/develop`.

1. **In-browser component testing**
   - Explore authoring and running component-focused tests in-browser (for example, a Vitest-compatible flow) using CDN-delivered tooling.
   - Define a lightweight test UX that supports writing tests, running them on demand, and displaying results in-app.

2. **CDN failure recovery UX**
   - Detect transient CDN/module loading failures and surface a clear recovery action in-app.
   - Add a user-triggered retry path (for example, Reload page / Force reload) when runtime bootstrap imports fail.
   - Consider an optional automatic one-time retry before showing recovery controls, while avoiding infinite reload loops.

3. **Deterministic E2E lane in CI**
   - Add an integration-style E2E path that uses locally served/pinned copies of CDN runtime dependencies for test execution, while keeping production runtime behavior unchanged.
   - Keep the current true CDN-backed E2E path as a separate smoke check, but make the deterministic lane the required gate for pull requests.
   - Run this deterministic E2E suite on **every pull request** in CI.
   - Ensure the deterministic lane still exercises the same user-facing flows (render, typecheck, lint, diagnostics drawer/button states), only swapping the source of runtime artifacts.
   - Suggested implementation prompt:
     - "Add a deterministic E2E execution mode for `@knighted/develop` that serves pinned runtime artifacts locally (instead of live CDN fetches) and wire it into CI as a required check on every PR. Keep a separate lightweight CDN-smoke E2E check for real-network coverage. Validate with `npm run lint`, deterministic Playwright PR checks, and one CDN-smoke Playwright run."

4. **Issue #18 continuation (resume from Phase 3)**
   - Current rollout status:
     - Phase 0 complete: feature flag + scaffolding.
     - Phase 1 complete: BYOT token flow, localStorage persistence, writable repo discovery/filtering.
     - Phase 2 complete: separate AI chat drawer UX, streaming-first responses with non-stream fallback, selected repository context plumbing, and README fine-grained PAT setup links.
   - Implement the next slice first (Phase 3):
     - Add mode-aware recommendation behavior so the assistant strongly adapts suggestions to current render mode and style mode.
     - Add an editor update workflow where the assistant can propose structured edits and the user can apply to Component and Styles editors with explicit confirmation.
     - Add filename groundwork for upcoming PR flows by allowing user-defined Component and Styles file names, persisted per selected repository.
   - Keep behavior and constraints aligned with current implementation:
     - Keep everything behind the existing browser-only AI feature flag.
     - Preserve BYOT token semantics (localStorage persistence until user deletes).
     - Keep CDN-first runtime behavior and existing fallback model.
     - Do not add dependencies without explicit approval.
   - Phase 3 mini-spec (agent implementation prompt):
     - "Continue Issue #18 in @knighted/develop from the current Phase 2 baseline. Implement Phase 3 with three deliverables. (1) Add mode-aware assistant guidance: when collecting AI context, include explicit policy hints derived from render mode and style mode, and ensure recommendations avoid incompatible patterns (for example, avoid React hook/state guidance in DOM mode unless user explicitly asks for React migration). (2) Add assistant-to-editor apply flow: support structured assistant responses that can propose edits for component and/or styles editors; render these as reviewable actions in the chat drawer, require explicit user confirmation to apply, and support a one-step undo for last applied assistant edit per editor. (3) Add PR-prep filename metadata: introduce user-editable fields for Component filename and Styles filename in AI controls, validate simple safe filename format, and persist/reload values scoped to selected repository so Phase 4 PR write flow can reuse them. Keep all AI/BYOT behavior behind the existing browser-only AI feature flag and preserve current token/repo persistence semantics. Do not add dependencies. Validate with npm run lint and targeted Playwright tests covering: mode-aware recommendation constraints, apply/undo editor actions, and repository-scoped filename persistence."
