# WebKit Open PR Drawer Triage Handoff

Date: 2026-03-29
Repository: develop
Branch: bananas

## Scope

This document captures investigation and fixes for WebKit failures in Playwright tests in playwright/github-pr-drawer.spec.ts.

Original failing subset:

- Open PR drawer confirms and submits component/styles filepaths
- Open PR drawer validates unsafe filepaths
- Open PR drawer allows dotted file segments that are not traversal

## Original symptoms

- Test flow appeared to continue behind a confirmation dialog in WebKit.
- Assertions expecting browser dialog events failed (browserDialogSeen false).
- In some runs, Open PR status remained at the default neutral text:
  Configure repository, file paths, and branch details.

## Root cause summary

- The app uses a shared in-page dialog opened by showModal for Open PR confirmation when confirmBeforeSubmit is wired.
- In WebKit, top-layer dialog timing and interaction can be flaky for test automation.
- The old test logic and app behavior supported two confirmation paths (HTML dialog and native confirm), which increased test complexity and flake risk.

## Relevant app wiring (for context)

- PR drawer submit uses confirmBeforeSubmit when available in src/modules/github-pr-drawer.js.
- App passes confirmBeforeSubmit to confirmAction in src/app.js.
- confirmAction opens the shared dialog element with id clear-confirm-dialog via showModal.
- Native window.confirm fallback has been removed.

## Changes made

Files:

- playwright/github-pr-drawer.spec.ts
- src/app.js
- src/modules/github-pr-drawer.js

1. Simplified tests to one confirmation path: HTML dialog only.
2. Removed dual-path test handling (native browser dialog vs in-page dialog).
3. Removed manual loop-based visibility fallback logic in tests.
4. Kept stable submit/confirm interactions and path-input stabilization in PR drawer tests.
5. Removed fallbackConfirmText usage from app call sites and PR drawer payload.
6. Removed native window.confirm fallback logic from confirmAction.
7. Unsupported dialog environments now no-op silently instead of showing a fallback prompt.

## Current status

Latest runs are green:

Command:
CI=true npx playwright test playwright/github-pr-drawer.spec.ts --project=webkit --headed --grep "Open PR drawer confirms and submits component/styles filepaths"
Result:
1 passed

Command:
CI=true npx playwright test playwright/github-pr-drawer.spec.ts --project=webkit --headed --grep "Open PR drawer confirms and submits component/styles filepaths|Open PR drawer allows dotted file segments that are not traversal|Open PR drawer validates unsafe filepaths"
Result:
3 passed

Command:
npx playwright test playwright/github-pr-drawer.spec.ts --project=chromium
Result:
15 passed

Command:
CI=true npx playwright test playwright/github-pr-drawer.spec.ts --project=webkit
Result:
15 passed

## Local changes currently present

- playwright/github-pr-drawer.spec.ts (modal-only confirmation helper refactor)
- src/app.js (removed native confirm fallback and fallbackConfirmText usage)
- src/modules/github-pr-drawer.js (removed fallbackConfirmText in submit confirmation payload)
- playwright.config.ts (workers changed from CI 2 to CI 1)
- package.json (added test:e2e:webkit using CI=true)

Note: playwright.config.ts worker change may be unrelated to this issue. Treat it as separate unless intentionally part of CI stabilization.

## Evergreen policy alignment

- Project policy is evergreen browsers only.
- HTML dialog support is assumed.
- No compatibility fallback is maintained for non-supporting/legacy environments.

## If this flakes again

1. Re-run only failing test first with headed mode and trace.
2. Confirm clear-confirm-dialog opens and confirm button click is delivered.
3. Confirm request flow occurs by adding temporary request counters for:

- git refs create
- contents upsert
- pulls create

4. If status remains default, verify submit click dispatch with a temporary event probe in test page context.
5. Keep assertions outcome-based (status/request side effects), not browser-event-path assumptions.

## Suggested next validation

1. Run full github-pr-drawer.spec.ts on WebKit.
2. Run same spec on Chromium and Firefox to ensure no regressions from helper changes.
3. If stable, keep helper approach and remove any temporary probes.

## Minimal rollback plan

Use this only if WebKit flakiness returns and you need to quickly de-risk test helper changes.

1. In playwright/github-pr-drawer.spec.ts, rollback only interaction mechanics first:

- replace DOM evaluate click calls with standard Playwright click calls.

2. Keep path validation stabilizers unless proven harmful:

- keep explicit toHaveValue checks.
- keep blur before submit in validation tests.

3. If still flaky, narrow rollback to failing tests only:

- inline confirmation flow in the failing tests and temporarily bypass shared helper usage.

4. Do not reintroduce native confirm fallback as a flake workaround.
5. Do not mix rollback with config churn:

- avoid changing playwright.config.ts in the same rollback commit unless worker count is confirmed root cause.

Quick validation after each rollback step:

Command:
CI=true npx playwright test playwright/github-pr-drawer.spec.ts --project=webkit --headed --grep "Open PR drawer confirms and submits component/styles filepaths"

Then:

Command:
CI=true npx playwright test playwright/github-pr-drawer.spec.ts --project=webkit --headed --grep "Open PR drawer confirms and submits component/styles filepaths|Open PR drawer allows dotted file segments that are not traversal|Open PR drawer validates unsafe filepaths"

Stop rollback at first stable step and keep the smallest diff that remains green.
