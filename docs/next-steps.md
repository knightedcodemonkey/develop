# Next Steps

Focused follow-up work for `@knighted/develop`.

1. **In-browser lint rules review and expansion**
   - Review the currently active Biome lint configuration in `src/modules/lint-diagnostics.js`, including rule groups, severities, and any custom suppression behavior.
   - Produce a recommended rule profile for component and style linting that balances signal quality with playground ergonomics.
   - Evaluate additional Biome rules to enable (or elevate severity) for:
     - correctness and suspicious patterns in component code,
     - accessibility and style consistency in JSX output,
     - CSS quality checks for style sources currently supported by Biome.
   - Revisit existing exceptions (for example unused App/View/render bindings) and document clear criteria for when suppression is acceptable.
   - Add/update regression coverage for the chosen rule profile in Playwright so diagnostics button/drawer behavior remains stable as rules evolve.
   - Document the finalized lint rule strategy in project docs so contributors can reason about why each rule is enabled, disabled, or downgraded.
   - Suggested implementation prompt:
     - "Audit the current Biome lint rules used by `@knighted/develop`, propose and apply a refined rule profile for component/styles linting, and add/update Playwright coverage to keep diagnostics UX stable under the new rules. Preserve intentional suppressions only when justified and document the reasoning. Validate with `npm run lint`, `npm run build:esm`, and targeted lint diagnostics Playwright tests."

2. **In-browser component type checking**
   - Prioritize first-run performance improvements in CDN/type graph hydration (request ordering, cache reuse, and avoiding redundant fetches) before deeper host refactors.
   - Continue improving warm-run typecheck performance for large sources while keeping the preview loop non-blocking.

3. **In-browser component testing**
   - Explore authoring and running component-focused tests in-browser (for example, a Vitest-compatible flow) using CDN-delivered tooling.
   - Define a lightweight test UX that supports writing tests, running them on demand, and displaying results in-app.

4. **CDN failure recovery UX**
   - Detect transient CDN/module loading failures and surface a clear recovery action in-app.
   - Add a user-triggered retry path (for example, Reload page / Force reload) when runtime bootstrap imports fail.
   - Consider an optional automatic one-time retry before showing recovery controls, while avoiding infinite reload loops.

5. **Deterministic E2E lane in CI**
   - Add an integration-style E2E path that uses locally served/pinned copies of CDN runtime dependencies for test execution, while keeping production runtime behavior unchanged.
   - Keep the current true CDN-backed E2E path as a separate smoke check, but make the deterministic lane the required gate for pull requests.
   - Run this deterministic E2E suite on **every pull request** in CI.
   - Ensure the deterministic lane still exercises the same user-facing flows (render, typecheck, lint, diagnostics drawer/button states), only swapping the source of runtime artifacts.
   - Suggested implementation prompt:
     - "Add a deterministic E2E execution mode for `@knighted/develop` that serves pinned runtime artifacts locally (instead of live CDN fetches) and wire it into CI as a required check on every PR. Keep a separate lightweight CDN-smoke E2E check for real-network coverage. Validate with `npm run lint`, deterministic Playwright PR checks, and one CDN-smoke Playwright run."
