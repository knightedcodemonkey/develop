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

4. **Issue #18 continuation (finish remaining Phase 3 scope)**
   - Current rollout status:
     - Phase 0 complete: feature flag + scaffolding.
     - Phase 1 complete: BYOT token flow, localStorage persistence, writable repo discovery/filtering.
     - Phase 2 complete: separate AI chat drawer UX, streaming-first responses with non-stream fallback, selected repository context plumbing, and README fine-grained PAT setup links.
     - Phase 3 partially complete: PR-prep filename/path groundwork landed via the Open PR drawer with repository-scoped persistence and stricter path validation.
     - Phase 4 complete: open PR flow from editor content (branch creation, file upserts, PR creation), confirmation UX, loading/success states, and toast feedback.
     - Post-implementation hardening complete: traversal/path validation edge cases, trailing-slash rejection, writable-repo select reset behavior during loading/error states, and a JS-driven Playwright readiness check.
   - Implement the next slice (remaining Phase 3 assistant features):
     - Add mode-aware recommendation behavior so the assistant strongly adapts suggestions to current render mode and style mode.
     - Add an editor update workflow where the assistant can propose structured edits and the user can apply to Component and Styles editors with explicit confirmation.
   - Keep behavior and constraints aligned with current implementation:
     - Keep everything behind the existing browser-only AI feature flag.
     - Preserve BYOT token semantics (localStorage persistence until user deletes).
     - Keep CDN-first runtime behavior and existing fallback model.
     - Do not add dependencies without explicit approval.
   - Remaining Phase 3 mini-spec (agent implementation prompt):
     - "Continue Issue #18 in @knighted/develop from the current baseline where PR filename/path groundwork and Open PR flow are already shipped. Implement the two remaining Phase 3 assistant deliverables. (1) Add mode-aware assistant guidance: when collecting AI context, include explicit policy hints derived from render mode and style mode, and ensure recommendations avoid incompatible patterns (for example, avoid React hook/state guidance in DOM mode unless user explicitly asks for React migration). (2) Add assistant-to-editor apply flow: support structured assistant responses that can propose edits for component and/or styles editors; render these as reviewable actions in the chat drawer, require explicit user confirmation to apply, and support a one-step undo for last applied assistant edit per editor. Keep all AI/BYOT behavior behind the existing browser-only AI feature flag and preserve current token/repo persistence semantics. Do not add dependencies. Validate with npm run lint and targeted Playwright tests covering mode-aware recommendation constraints and apply/undo editor actions."

5. **Phase 2 UX/UI continuation: fixed editor tabs first pass (Component, Styles, App)**
   - Continue the tabs/editor UX work with a constrained first implementation that supports exactly three editor tabs: Component, Styles, and App.
   - Do not introduce arbitrary/custom tab names in this pass; treat custom naming as future scope after baseline tab behavior is stable.
   - Preserve existing runtime behavior and editor content semantics while adding tab switching, active tab indication, and predictable persistence/reset behavior consistent with current app patterns.
   - Ensure assistant/editor integration remains compatible with this model (edits should target one of the fixed tabs) without expanding to dynamic tab metadata yet.
   - Suggested implementation prompt:
     - "Implement Phase 2 UX/UI tab support in @knighted/develop with a fixed first-pass tab model: Component, Styles, and App only (no arbitrary tab names yet). Add a clear tab UI for switching editor panes, preserve existing editor behavior/content wiring, and keep render/lint/typecheck/diagnostics flows working with the selected tab context where relevant. Keep AI/BYOT feature-flag behavior unchanged, maintain CDN-first runtime constraints, and do not add dependencies. Add targeted Playwright coverage for tab switching, default/active tab behavior, and interactions with existing render/style-mode flows. Validate with npm run lint and targeted Playwright tests."

6. **Document implicit App strict-flow behavior (auto render)**
   - Add a short behavior matrix in docs that explains when implicit App wrapping is allowed versus when users must define `App` explicitly.
   - Include concrete Component editor examples for each case so reviewer/user expectations are clear.
   - Suggested example cases to document:
     - Allowed implicit wrap (standalone top-level JSX, no imports/declarations), for example:
       - `(<button type="button">Standalone</button>) as any`
     - Requires explicit `App` (top-level JSX with declarations/imports), for example:
       - `const label = 'Hello'`
       - `const Button = () => <button>{label}</button>`
       - `(<Button />) as any`
     - Recommended explicit pattern, for example:
       - `const Button = () => <button>Hello</button>`
       - `const App = () => <Button />`
   - Suggested implementation prompt:
     - "Document the current implicit App behavior in @knighted/develop for auto-render mode using a compact behavior matrix and concrete component-editor snippets. Clearly distinguish supported implicit wrapping from cases that intentionally require an explicit App (such as top-level JSX mixed with imports/declarations). Keep docs concise, aligned with current runtime behavior, and include at least one positive and one explicit-error example."

7. **Evaluate GitHub file upsert request strategy (metadata-first vs optimistic PUT)**
   - Revisit the current metadata-first `upsertRepositoryFile` approach and compare it against an optimistic PUT + targeted retry-on-missing-sha flow.
   - Measure tradeoffs for latency, GitHub API request count/rate-limit impact, and browser-console signal quality during common PR flows.
   - If beneficial, introduce a configurable/hybrid strategy (for example, optimistic default with metadata fallback) without regressing current reliability.
   - Suggested implementation prompt:
     - "Evaluate and optionally optimize @knighted/develop GitHub file upsert behavior. Compare metadata-first preflight GET+PUT against optimistic PUT with retry-on-missing-sha for existing files. Keep current reliability guarantees and avoid reintroducing noisy false-positive failures. If implementing a hybrid/configurable strategy, keep defaults conservative, update docs, and validate with npm run lint plus targeted Playwright PR drawer flows."
