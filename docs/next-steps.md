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
   - Add editor-linked diagnostics navigation so each issue can jump to the exact line/column in the component source.
   - Surface line/column context directly in the diagnostics UI (not just message text) to speed up triage.
   - Continue improving typecheck performance for first-run and large sources while keeping the preview loop non-blocking.

3. **In-browser component testing**
   - Explore authoring and running component-focused tests in-browser (for example, a Vitest-compatible flow) using CDN-delivered tooling.
   - Define a lightweight test UX that supports writing tests, running them on demand, and displaying results in-app.

4. **CDN failure recovery UX**
   - Detect transient CDN/module loading failures and surface a clear recovery action in-app.
   - Add a user-triggered retry path (for example, Reload page / Force reload) when runtime bootstrap imports fail.
   - Consider an optional automatic one-time retry before showing recovery controls, while avoiding infinite reload loops.

5. **Type reference parsing hardening (TS preprocessor-first)**
   - Transition declaration/reference discovery in in-browser type diagnostics to a TypeScript preprocessor-first flow (`ts.preProcessFile`) instead of regex-driven parsing.
   - Scope this to the lazy React type environment loader first, then evaluate whether the same parser path should be reused for all type package graph walking.
   - Keep current lazy-loading behavior intact: no React type graph fetch until the user switches to React render mode and triggers Typecheck.
   - Preserve CDN provider fallback behavior and existing diagnostics UX while changing parser internals.
   - Add a strict fallback contract:
     - Primary: `preProcessFile` outputs (`importedFiles`, `referencedFiles`, `typeReferenceDirectives`).
     - Secondary fallback only when unavailable: current lightweight parsing logic.
     - Never treat commented example code as imports/references.
   - Add guardrails around known failure classes discovered during development:
     - Relative declaration references like `global.d.ts` must resolve as file paths, not package names.
     - Extensionless declaration references (for example `./user-context`) must attempt `.d.ts` candidates first.
     - Avoid noisy parallel fetch fan-out for bad candidates; use ordered fallback to reduce 404/CORS console noise.
   - Add focused test coverage (unit or Playwright) that proves:
     - React-mode typecheck does not trigger fake fetches from commented examples in declaration files.
     - React-mode typecheck resolves `react` and `react-dom/client` without module-not-found diagnostics.
     - DOM mode still avoids React type graph hydration.
   - Suggested implementation prompt:
     - "Refactor `src/modules/type-diagnostics.js` to make TypeScript preprocessor parsing (`preProcessFile`) the source of truth for declaration graph discovery in the lazy React type loader. Keep current CDN fallback and lazy hydration semantics. Ensure references from comments are ignored, `*.d.ts`/relative path handling is correct, and candidate fetch ordering minimizes noisy failed requests. Add regression coverage for `global.d.ts` and commented `./user-context` examples. Validate with `npm run lint`, `npm run build:esm`, and targeted React/typecheck Playwright runs."

6. **Deterministic E2E lane in CI**
   - Add an integration-style E2E path that uses locally served/pinned copies of CDN runtime dependencies for test execution, while keeping production runtime behavior unchanged.
   - Keep the current true CDN-backed E2E path as a separate smoke check, but make the deterministic lane the required gate for pull requests.
   - Run this deterministic E2E suite on **every pull request** in CI.
   - Ensure the deterministic lane still exercises the same user-facing flows (render, typecheck, lint, diagnostics drawer/button states), only swapping the source of runtime artifacts.
   - Suggested implementation prompt:
     - "Add a deterministic E2E execution mode for `@knighted/develop` that serves pinned runtime artifacts locally (instead of live CDN fetches) and wire it into CI as a required check on every PR. Keep a separate lightweight CDN-smoke E2E check for real-network coverage. Validate with `npm run lint`, deterministic Playwright PR checks, and one CDN-smoke Playwright run."
