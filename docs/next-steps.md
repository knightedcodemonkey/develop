# Next Steps

Focused follow-up work for `@knighted/develop`.

1. **In-browser component/style linting**
   - Explore running lint checks for component and style sources directly in the playground.
   - Prefer CDN-delivered tooling where possible and preserve graceful fallback behavior when unavailable.

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
