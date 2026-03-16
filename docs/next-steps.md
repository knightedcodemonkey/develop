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
   - Explore TypeScript/JSX type checking for component source in-browser using CDN-delivered tooling.
   - Keep diagnostics responsive and surface clear inline/editor feedback without blocking the preview loop.

5. **In-browser component testing**
   - Explore authoring and running component-focused tests in-browser (for example, a Vitest-compatible flow) using CDN-delivered tooling.
   - Define a lightweight test UX that supports writing tests, running them on demand, and displaying results in-app.
