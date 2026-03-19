# Lint Workers Plan

This document defines the worker-based lint architecture for component and styles
panels in `@knighted/develop`.

## Goals

- Use `eslint@10` for component linting.
- Use `stylelint` for style linting.
- Run both in Web Workers so preview/typecheck remain responsive.
- Reuse shared request/response and diagnostics formatting logic.
- Keep ESLint and Stylelint implementations in separate modules.

## Module Layout

Main thread:

- `src/modules/lint/lint-controller.js`: orchestrates component/style lint flows.
- `src/modules/lint/eslint/worker-adapter.js`: ESLint request adapter.
- `src/modules/lint/stylelint/worker-adapter.js`: Stylelint request adapter.
- `src/modules/lint/shared/worker-client.js`: worker RPC, timeout, cancellation.
- `src/modules/lint/shared/protocol.js`: shared message contract.
- `src/modules/lint/shared/format.js`: shared diagnostics normalization/formatting.

Worker thread:

- `src/modules/lint-worker.js`: worker entrypoint and engine dispatch.
- `src/modules/lint/worker/runtime-loader.js`: runtime loading with CDN candidates.
- `src/modules/lint/worker/eslint-runtime.js`: ESLint execution path.
- `src/modules/lint/worker/stylelint-runtime.js`: Stylelint execution path.

Engine-specific config:

- `src/modules/lint/eslint/config.js`: ESLint lint options.
- `src/modules/lint/stylelint/config.js`: Stylelint lint options and syntax map.

## Rollout Phases

1. Scaffold worker runtime plumbing.
2. Wire panel actions in `src/index.html` and `src/app.js` for:
   - Component Lint
   - Styles Lint
3. Keep lint on-demand first; avoid auto-lint until runtime stability is proven.
4. Add line/column click navigation to editors once diagnostics UI supports
   structured entries.
5. Add Playwright coverage for:
   - Component lint success and error scenarios.
   - Style lint success for `css`, `module`, `less`, and `sass` modes.
   - Timeout/unavailable runtime fallback states.

## Runtime Notes

- `eslint@10` is the target runtime.
- Stylelint syntax handling is dialect-aware:
  - `css`, `module` -> default CSS syntax.
  - `less` -> `postcss-less` custom syntax.
  - `sass` -> `postcss-scss` custom syntax.
- Runtime loading currently uses CDN candidate fallback and should stay lazy.

## Virtual Filesystem Policy

- Baseline linting is single-file and does not require a virtual filesystem.
- If cross-file linting becomes required, do not roll a custom virtual
  filesystem implementation first.
- Prefer a maintained virtual filesystem library with browser-worker support and
  predictable path normalization semantics.

## Follow-up Tasks

- Confirm browser-compatible runtime bundles for ESLint 10 + required plugins.
- Confirm browser-compatible stylelint bundle path and syntax plugin availability.
- Move diagnostics scope rendering from string-only lines to structured entries.
