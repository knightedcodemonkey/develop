# Render Pipeline + Multi-Tab Spec Plan

This document outlines test coverage to add after the render pipeline rewrite is fully integrated with the multi-tab UX.

## Why this plan exists

Current test coverage intentionally removed a subset of specs that were tightly coupled to pre-rewrite assumptions:

1. Legacy assumptions around default-export hydration behavior in preview module assembly.
2. Styles diagnostics behavior that depended on old compile/lint sequencing.
3. PR drawer path validation timing assumptions tied to previous field sync flow.

These should return as updated tests once the new pipeline contract is finalized.

## Proposed Test Areas

## 1. Entry Resolution and Execution Semantics

Goal: Validate how preview entry is resolved from workspace tabs under the `role: entry` model.

Add specs for:

1. Entry selection prefers explicit `role: entry`, with documented fallback behavior only when no explicit entry is present.
2. Entry rename between `App.tsx` and `App.js` keeps execution stable.
3. Entry path updates preserve directory while enforcing filename convention.
4. Reload restores same entry tab and executes same source.

## 2. Default Export Handling in New Hydration Pipeline

Goal: Reintroduce export-default tests against the final module assembly support matrix.

Add specs for:

1. `export default () => ...` in entry tab with manual render.
2. `export default class ...` in React mode.
3. `function App() { ... } export default App` compatibility.
4. `const Button = ...; export default Button` behavior when App wrapper is implicit or explicit.
5. Negative cases: unsupported default-export combinations produce deterministic diagnostics.

## 3. Cross-Tab Import Graph Hydration

Goal: Ensure workspace graph resolution works across multiple component and style tabs.

Add specs for:

1. Entry imports sibling component tab by relative specifier.
2. Nested dependency chain (A imports B imports C) hydrates in stable order.
3. Missing module path reports actionable preview error including unresolved specifier.
4. Circular import emits stable error (or supported behavior) without hanging.
5. Windows-style and POSIX-style separators normalize consistently in lookup keys.

## 4. Styles Pipeline and Diagnostics Contract

Goal: Lock down expected diagnostics and status transitions for style dialects.

Add specs for:

1. Sass compilation error sets diagnostics state to error with styles-scope detail.
2. Less error path behavior parity with Sass.
3. Switching style mode clears stale diagnostics according to final pipeline contract.
4. Styles lint diagnostics and compile diagnostics coexist or prioritize per contract.
5. Clearing style diagnostics does not clear unrelated component diagnostics.

## 5. Status and Diagnostics State Machine

Goal: Ensure app status text/class and diagnostics toggle class remain consistent.

Add specs for:

1. Pending to error to neutral transitions for typecheck + lint + render.
2. Multiple error sources aggregate counts correctly.
3. Clearing one scope updates only corresponding status/diagnostics indicators.
4. Auto-render off path keeps status stable until explicit render.

## 6. Multi-Tab Tool Visibility and Actionability

Goal: Guarantee controls are actionable only for active editor tab and panel.

Add specs for:

1. Component controls hidden/inert when styles tab is active.
2. Styles controls hidden/inert when component tab is active.
3. Keyboard interactions in inactive panel do not mutate source.
4. Tab switches maintain tool visibility state and collapse state correctly.

## 7. Persistence and Isolation Guarantees

Goal: Verify deterministic startup and no stale state bleed between sessions.

Add specs for:

1. IndexedDB workspace restore across reload preserves tabs, active tab, entry role, and paths.
2. PR drawer saved config does not unexpectedly overwrite active workspace tab paths.
3. New session starts clean when storage is reset in tests.
4. Repository switch behavior isolates per-repo local context and config.

## 8. PR Drawer Path Validation and Sync

Goal: Revisit path validation behavior after final field sync implementation.

Add specs for:

1. Reject traversal (`../`) for component and styles paths.
2. Reject trailing slash paths for component and styles fields.
3. Allow dotted segments that are not traversal.
4. Entry-specific filename rule enforcement (`App.tsx` or `App.js`) reflected in drawer path values.

## 9. Test Infrastructure Improvements

Goal: Keep suites stable as UX evolves.

Actions:

1. Add helper APIs for tab activation before control interactions.
2. Add one reset helper per suite to clear localStorage, sessionStorage, and IndexedDB.
3. Prefer role/name selectors that match active-tab semantics.
4. Avoid assertions that require hidden panel controls to be clickable.

## Suggested Rollout Order

1. Entry resolution + default-export support matrix.
2. Cross-tab import graph hydration.
3. Styles diagnostics contract.
4. Status state machine.
5. PR drawer path validation synchronization.
6. Persistence/isolation hardening.

## Definition of Done for this plan

Before reintroducing removed specs, the render pipeline implementation should provide a written behavior contract for:

1. Entry tab selection.
2. Default export support matrix.
3. Style compile + lint diagnostics precedence.
4. Status/diagnostics state transitions.
5. Path normalization and validation across workspace tabs and PR drawer fields.
