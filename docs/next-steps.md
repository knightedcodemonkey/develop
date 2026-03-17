# Next Steps

Focused follow-up work for `@knighted/develop`.

1. **Style isolation behavior docs**
   - Document ShadowRoot on/off behavior and how style isolation changes in light DOM mode.
   - Clarify that light DOM preview can inherit shell styles and include recommendations for scoping.

2. **Preview UX polish**
   - Keep tooltip affordances for mode-specific behavior.
   - Continue tightening panel control alignment and spacing without introducing extra markup.

3. **In-browser component/style linting**
   - Explore running lint checks for component and style sources directly in the playground.
   - Prefer CDN-delivered tooling where possible and preserve graceful fallback behavior when unavailable.

4. **In-browser component type checking**
   - Add editor-linked diagnostics navigation so each issue can jump to the exact line/column in the component source.
   - Surface line/column context directly in the diagnostics UI (not just message text) to speed up triage.
   - Continue improving typecheck performance for first-run and large sources while keeping the preview loop non-blocking.

5. **In-browser component testing**
   - Explore authoring and running component-focused tests in-browser (for example, a Vitest-compatible flow) using CDN-delivered tooling.
   - Define a lightweight test UX that supports writing tests, running them on demand, and displaying results in-app.

6. **App runtime modularization**
   - Plan a refactor that splits `src/app.js` into scoped modules organized by functionality (for example: diagnostics, render pipeline, editor integration, UI controls, and persistence).
   - Preserve `src/app.js` as the main runtime orchestration entrypoint while moving implementation details into focused modules.
   - Split stylesheet concerns into focused files (for example: layout/shell, panel controls, diagnostics, editor overrides, dialogs/overlays) while keeping `src/styles.css` as the single entrypoint via ordered `@import` directives.
   - Define clear module boundaries and shared interfaces so behavior stays stable while maintainability and readability improve.
