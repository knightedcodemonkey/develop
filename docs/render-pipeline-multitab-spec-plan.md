# Render Pipeline + Multi-Tab Vital Remaining Spec TODOs

This file tracks only high-value gaps that still need coverage.

## Already Covered (summary)

1. Entry-tab role behavior, rename stability, and restore behavior.
2. Cross-tab import graph basics, missing-module and circular-import determinism.
3. Core diagnostics/status flows, including pending/error/neutral transitions.
4. Workspace persistence and per-repo context/config isolation baseline.

## Vital Remaining TODOs

## 1. Default Export Support Matrix (High Risk)

Add explicit render/typecheck specs for:

1. `export default class ...` in React mode.
2. `function App() { ... } export default App` behavior.
3. `const X = ...; export default X` behavior with entry-wrapper rules.
4. Unsupported default-export combinations producing deterministic diagnostics.

## 2. Style Compile vs Lint Contract (High Risk)

Lock down precedence and parity:

1. Less error-path parity with Sass error behavior.
2. Compile diagnostics + lint diagnostics precedence/coexistence contract.
3. Clearing styles diagnostics does not affect component diagnostics/status.

## 3. Status Aggregation Contract (High Risk)

Add state-machine coverage for:

1. Multiple simultaneous error sources aggregating counts correctly.
2. Clearing one scope updates only that scope and leaves other error states intact.

## 4. Inactive Panel Mutation Guard (Medium Risk)

Add keyboard/actionability spec that proves inactive editor panel input cannot mutate source.

## 5. Update Obsolete PR Path-Validation Section (Doc/Test Hygiene)

Old PR drawer filename-field validation cases are obsolete after tab-derived commit targets.

1. Replace with tab-derived commit target validation/normalization tests.
2. Remove any remaining assumptions about component/styles filename fields in PR drawer flows.

## Minimal Done Criteria

This plan is complete when the five sections above are covered by Playwright tests and linked from the affected suites.
