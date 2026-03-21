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
