# Type Checking In The Browser

This document explains how `@knighted/develop` performs TypeScript diagnostics directly in the browser, including the general flow for all render modes and the React-mode-specific type graph loading path.

## Goals

- Provide on-demand TypeScript diagnostics without a local build step.
- Keep render/preview UX responsive while type checks run.
- Support a generic baseline in DOM mode.
- Support a realistic React typing environment in React mode.
- Preserve CDN fallback behavior so diagnostics can still run when one provider fails.

## High-Level Architecture

Browser type checking is implemented by combining three pieces:

1. TypeScript compiler runtime loaded from CDN.
2. Virtual filesystem assembled in memory from source + declaration files.
3. Custom TypeScript host and module resolution bridge that reads from the virtual filesystem.

At runtime this is managed by `createTypeDiagnosticsController` in `src/modules/type-diagnostics.js` and wired from `src/app.js`.

## Generic Typecheck Flow (All Modes)

When the user clicks Typecheck:

1. Ensure TypeScript compiler runtime is loaded from CDN.
2. Build (or reuse) TypeScript standard library declarations (`lib.*.d.ts`).
3. Read current editor source (`component.tsx`).
4. Build a virtual file map for the current run.
5. Create a TypeScript `Program` with a custom host.
6. Collect diagnostics and display formatted output in the diagnostics UI.

### Compiler Loading

- TypeScript runtime is loaded using `importFromCdnWithFallback`.
- The selected provider is remembered for downstream declaration URL generation.

### Standard Library Hydration

- `getTypeScriptLibUrls(...)` provides provider-prioritized URLs for TS lib declarations.
- Triple-slash `reference lib` and `reference path` directives are followed recursively.
- Loaded files are cached in memory so repeated checks do not re-fetch.

### Program Options (Generic)

- `jsx: Preserve`
- `target: ES2022`
- `module: ESNext`
- `moduleResolution: Bundler` (fallback NodeNext/NodeJs)
- `strict: true`
- `noEmit: true`
- `skipLibCheck: true`
- `types: []` to disable implicit ambient type package scanning in this virtual environment

The explicit `types: []` avoids TypeScript attempting implicit `@types/*` discovery that does not map to a real disk `node_modules` in browser.

## DOM Mode Behavior

DOM mode uses a lightweight ambient JSX definition that is injected into the virtual filesystem as a synthetic declaration file.

This keeps the baseline path minimal and avoids loading React type packages when they are not needed.

## React Mode Behavior: Lazy CDN Type Hydration

React mode enables an additional lazy type graph loader:

- Trigger condition: render mode is `react` and Typecheck is run.
- Root packages: `@types/react` and `@types/react-dom`.
- Transitive dependencies are discovered and loaded on demand.
- Everything is cached after first load.

### CDN Type Package URL Strategy

`getTypePackageFileUrls(...)` generates candidate URLs for type package files with a fallback order that favors raw package CDNs before esm-hosted variants.

Current priority for type package files:

1. jsDelivr
2. unpkg
3. active TypeScript provider (if present)
4. esm.sh

This ordering reduces issues from transformed declaration content.

### Declaration Graph Discovery

For each loaded declaration file:

1. Parse references with `ts.preProcessFile` when available.
2. Fallback to a minimal regex parser only if preprocessor is unavailable.
3. Follow imports/references/type directives recursively.

Guardrails:

- Relative declaration references are treated as paths.
- Extensionless references try `.d.ts` candidates first.
- Absolute URL specifiers are ignored.
- Commented example imports are not treated as real dependencies.

### Candidate File Resolution

When a declaration path is ambiguous, candidates are tried in ordered fallback:

1. `<path>.d.ts`
2. script-extension-normalized `.d.ts`
3. `<path>/index.d.ts`
4. raw `<path>`

This reduces noisy failed requests and improves compatibility with DefinitelyTyped layouts.

## Virtual Filesystem Design

The virtual filesystem is a `Map<string, string>` where keys are normalized virtual paths.

Typical entries include:

- `component.tsx`
- `lib.esnext.full.d.ts` and referenced TS lib files
- `knighted-jsx-runtime.d.ts` (DOM mode only)
- `node_modules/@types/react/...`
- `node_modules/@types/react-dom/...`
- transitive type deps like `node_modules/csstype/...`

The loader maintains:

- loaded file content cache
- package manifest cache
- package entrypoint cache
- in-flight promise dedupe for concurrent requests

## TypeScript Host + Resolver Bridge

A custom host is supplied to TypeScript `createProgram(...)` and reads from the virtual map:

- `fileExists`
- `readFile`
- `directoryExists`
- `getDirectories`
- `getSourceFile`
- `resolveModuleNames`

Resolver strategy:

1. Ask TypeScript `resolveModuleName(...)` first.
2. If unresolved and React type graph is active, resolve via virtual `node_modules` candidates.

This allows TypeScript diagnostics to behave like a project-backed environment while operating purely in browser memory.

## Diagnostics UI Integration

- Typecheck state is surfaced via loading/neutral/ok/error states.
- Results are formatted with line/column when available.
- Existing render status is preserved and adjusted when type errors are present.
- Re-check scheduling is supported when unresolved type errors already exist.

## Known Constraints

- This is intentionally diagnostics-only (`noEmit`).
- Type package compatibility still depends on CDN availability.
- Browser security and CDN headers may surface noisy network failures on provider fallback paths.
- Complex package resolution edge cases may still require targeted guardrails.

## Why This Approach

Compared to a server-side typecheck service, this approach keeps feedback local to the browser session and aligns with the CDN-first architecture of `@knighted/develop`.

Compared to a purely regex-driven declaration walker, TypeScript preprocessor parsing gives a more robust dependency graph with fewer false positives.

## Validation And Regression Coverage

Recent changes are protected with Playwright coverage that checks:

- React-mode Typecheck succeeds.
- Expected `@types/react` loading occurs.
- Malformed type fetch URL patterns do not occur.

Recommended local validation when changing this system:

```bash
npm run lint
npm run build:esm
npm run test:e2e -- --grep "react mode typecheck"
```

## Future Improvements

- Add explicit lazy-loading assertions (no `@types/*` requests before first React-mode Typecheck).
- Expand diagnostics UI with jump-to-line navigation and richer context.
- Consider optional user-configurable extra type roots after baseline stability is proven.
