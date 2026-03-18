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
