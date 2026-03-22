---
applyTo: '**'
---

# Pull Request Review Guidance

You are reviewing changes for @knighted/develop. Be concise, technical, and specific. Prioritize actionable feedback tied to concrete files and lines.

## Browser support policy

- Target evergreen browsers only (current stable Chrome, Edge, Safari, and Firefox).
- Do not require old-browser compatibility unless the PR explicitly expands support scope.
- Do not request legacy polyfills or fallback-only workarounds by default.

## Focus areas

- CDN-first runtime integrity: imports and fallback behavior should remain compatible with src/modules/cdn.js patterns.
- UI state correctness: drawers, toggles, dialogs, and compact/mobile states should remain synchronized and predictable.
- BYOT safety: token handling must stay browser-local, avoid leakage, and preserve clear user-facing privacy/removal cues.
- Accessibility and semantics: form controls, labels, button types, ARIA relationships, and keyboard interactions should be valid.
- Build and workflow stability: scripts and output behavior should remain consistent unless change is explicitly documented.
- Tests and docs alignment: behavior changes should update tests and relevant docs.

## What to verify

- No generated artifacts are edited (dist/, coverage/, test-results/).
- CDN import/fallback behavior is not bypassed with ad hoc URLs in feature modules.
- Sensitive values (PAT/token) are not logged or exposed in UI/status output.
- New UI behavior is covered in Playwright where appropriate.
- Lint/build expectations still pass for changed areas.

## Validation expectations

- Run npm run lint for code and HTML/a11y checks.
- Run npm run build when touching scripts/, bootstrap/runtime wiring, or import map behavior.
- For interactive UI changes, confirm behavior in compact/mobile layout and at least one non-default mode.

## Review output format

- Present findings first, ordered by severity.
- Label each finding as blocking, important, or nit.
- Include file reference and the minimal fix direction.
- Keep summary brief and secondary to findings.

## Ask for changes when

- Behavior changes ship without corresponding test updates.
- New dependencies are added without clear approval.
- Build/CI/import-map contracts change without docs updates.
- Accessibility regressions or semantic HTML issues are introduced.
- Feedback requests are based on unsupported legacy-browser constraints.
