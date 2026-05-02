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

4. **Evaluate GitHub file upsert request strategy (metadata-first vs optimistic PUT)**
   - Revisit the current metadata-first `upsertRepositoryFile` approach and compare it against an optimistic PUT + targeted retry-on-missing-sha flow.
   - Measure tradeoffs for latency, GitHub API request count/rate-limit impact, and browser-console signal quality during common PR flows.
   - If beneficial, introduce a configurable/hybrid strategy (for example, optimistic default with metadata fallback) without regressing current reliability.
   - Suggested implementation prompt:
     - "Evaluate and optionally optimize @knighted/develop GitHub file upsert behavior. Compare metadata-first preflight GET+PUT against optimistic PUT with retry-on-missing-sha for existing files. Keep current reliability guarantees and avoid reintroducing noisy false-positive failures. If implementing a hybrid/configurable strategy, keep defaults conservative, update docs, and validate with npm run lint plus targeted Playwright PR drawer flows."

5. **Promise handling conventions (consistency of intent)**
   - Define a project default: use `async`/`await` with `try`/`catch` for most async control flow.
   - Keep Promise chains where they better express intent (for example, fire-and-forget paths with explicit `.catch()` to avoid unhandled rejections, or concise pass-through composition).
   - Document this as an intent-first rule so mixed syntax is acceptable only when deliberate and easy to reason about.
   - Add a lightweight lint/review rule to flag mixed async styles in the same flow unless there is a clear justification.
   - Suggested implementation prompt:
     - "Define and apply async handling conventions in @knighted/develop with consistency of intent: default to async/await + try/catch, allow Promise chains for explicit fire-and-forget and concise composition, and require explicit .catch on unawaited promises. Update docs and enforce via lint/review guidance without broad no-op refactors. Validate with npm run lint and targeted Playwright runs."
