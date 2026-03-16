# Next Steps

Focused follow-up work for `@knighted/develop`.

1. **Style isolation behavior docs**
   - Document ShadowRoot on/off behavior and how style isolation changes in light DOM mode.
   - Clarify that light DOM preview can inherit shell styles and include recommendations for scoping.

2. **Preview UX polish**
   - Keep tooltip affordances for mode-specific behavior.
   - Continue tightening panel control alignment and spacing without introducing extra markup.

3. **Theming (light + dark)**
   - Keep the existing dark mode as the baseline and add a first-class light theme.
   - Move key colors to semantic CSS variables and define both theme palettes.
   - Ensure component panels, controls, editor chrome, preview shell, and tooltips all have complete light-mode coverage.
   - Verify contrast/accessibility across both themes and preserve visual hierarchy parity.
