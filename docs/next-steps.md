# Next Steps

Focused follow-up work for `@knighted/develop`.

1. **In-browser component/style linting**
   - Replace the current ESLint/Stylelint worker direction with a Biome-first plan using `@biomejs/wasm-web` loaded from CDN.
   - Remove lint-specific web worker plumbing and run lint directly on demand in the main runtime, while keeping lint execution isolated behind a small module boundary.
   - Add a single lint service module that:
     - lazily loads and initializes Biome WASM once,
     - caches the initialized runtime,
     - exposes `lintComponent(source, filename)` and `lintStyles(source, filename, styleMode)` entrypoints.
   - Keep `src/modules/cdn.js` as the source of truth for Biome runtime candidates and provider fallbacks.
   - Define an explicit style-mode strategy for non-CSS sources:
     - CSS/CSS Modules: lint directly as CSS.
     - Less/Sass: start with graceful "not yet supported" diagnostics, or optionally lint post-compiled CSS if output mapping quality is acceptable.
   - Normalize Biome diagnostics into existing diagnostics UI shape (headline + line/column + severity + rule id), so no diagnostics drawer redesign is required.
   - Preserve graceful degradation: if Biome fails to load/initialize, show a clear "Lint unavailable" message without breaking render/typecheck loops.
   - Add Playwright coverage for:
     - successful component lint run,
     - successful CSS lint run,
     - runtime-load failure path showing recovery-oriented messaging.
   - Suggested implementation prompt:
     - "Refactor `@knighted/develop` in-browser linting to use `@biomejs/wasm-web` as the primary engine for component and style lint checks. Remove lint web worker plumbing, add a lazy-initialized Biome lint service, keep CDN provider fallback definitions in `src/modules/cdn.js`, and map Biome diagnostics into existing component/styles diagnostics UI. For Less/Sass, add an explicit temporary unsupported diagnostic (or post-compile CSS lint only if mapping remains readable). Validate with `npm run lint`, `npm run build:esm`, and targeted lint-button Playwright checks."

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
