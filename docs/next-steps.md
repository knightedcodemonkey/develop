# Next Steps

Focused follow-up work for `@knighted/develop`.

1. **Grid-first header/layout cleanup**
   - Refactor panel header layout to use CSS Grid as the primary layout mechanism.
   - Reduce wrapper rows where possible and place controls explicitly in grid areas.
   - Preserve existing semantics and accessibility behavior while simplifying structure.
   - Validate desktop/mobile breakpoints and keep visual behavior parity.

2. **Style isolation behavior docs**
   - Document ShadowRoot on/off behavior and how style isolation changes in light DOM mode.
   - Clarify that light DOM preview can inherit shell styles and include recommendations for scoping.

3. **Preview UX polish**
   - Keep tooltip affordances for mode-specific behavior.
   - Continue tightening panel control alignment and spacing without introducing extra markup.

4. **Theming (light + dark)**
   - Keep the existing dark mode as the baseline and add a first-class light theme.
   - Move key colors to semantic CSS variables and define both theme palettes.
   - Ensure component panels, controls, editor chrome, preview shell, and tooltips all have complete light-mode coverage.
   - Verify contrast/accessibility across both themes and preserve visual hierarchy parity.
