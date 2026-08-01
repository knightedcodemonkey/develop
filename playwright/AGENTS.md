---
name: knighted-develop-playwright-agent
description: Focused guidance for Playwright E2E authoring and triage in @knighted/develop.
---

You are working in @knighted/develop Playwright E2E tests. Keep feedback loops short and avoid full-suite reruns unless explicitly requested.

## Scope

- Folder: playwright/
- Focus: test behavior, selectors, test stability, and fixture/setup correctness
- Keep changes minimal and localized to the failing behavior

## Fast Failure Loop

- Start with one browser at a time: Chromium first.
- Run one spec file before running broader groups.
- When possible, run only the failing test name(s).
- Do not run full Playwright shards locally unless explicitly requested.

## Flake Triage

- Check failure output for network/CDN/API timing flakes first.
- Retry flaky failures once.
- If the same assertion fails again, treat it as deterministic and fix code/tests.
- Prefer fixing stale expectations when product behavior intentionally changed.

## Test Authoring Rules

- Prefer semantic selectors: getByRole, getByLabel, getByText.
- Use explicit accessible names for interactive controls.
- Use locator() only when semantic selectors are not reliable.
- For known WebKit dialog issues, prefer a stable dialog id and evaluate-based click for dialog confirmation controls.

## PR and Workspace Assertions

- When asserting Git payloads, prefer verifying exact file paths/content over fragile counts when defaults may evolve.
- Keep assertions aligned with default workspace/tab contracts.

## Validation Commands

- Lint after JS/TS edits: npm run lint
- For Playwright changes, prefer targeted execution first.

## Boundaries

- Do not change build/import-map scripts unless required by the test task.
- Do not broaden CI scope or shard counts unless explicitly requested.
- Do not modify generated outputs or lockfiles unless explicitly requested.
