# Contributing

Thanks for contributing to `@knighted/develop`.

This project is a CDN-first browser IDE for showcasing `@knighted/jsx` and
`@knighted/css`, so local workflows should preserve browser execution behavior
and avoid bundler-only assumptions in `src/` runtime code.

## Project docs

- Type checking notes: `docs/type-checking.md`
- Build and deploy notes: `docs/build-and-deploy.md`
- CodeMirror integration notes: `docs/code-mirror.md`
- Roadmap: `docs/next-steps.md`
- Article draft: `docs/article.md`

## Prerequisites

- Node.js `>= 22.22.1`
- npm

## Install

```bash
npm install
```

## Local development

Start the local app:

```bash
npm run dev
```

The local server opens `src/index.html`.

## Build commands

Build prep + CSS + import map generation:

```bash
npm run build
```

Build with explicit primary CDN modes:

```bash
npm run build:esm
npm run build:jspm
npm run build:importmap-mode
```

Preview generated dist output:

```bash
npm run preview
```

## Validation commands

Lint source and Playwright files:

```bash
npm run lint
```

Type check TS tooling files:

```bash
npm run check-types
```

## Playwright end-to-end tests

Install browser binaries once:

```bash
npx playwright install
```

If your environment also needs system deps (for example CI-like Linux
containers):

```bash
npx playwright install --with-deps
```

Run preview-mode E2E suite:

```bash
npm run test:e2e
```

Run dev-mode E2E suite:

```bash
npm run test:e2e:dev
```

Run preview-mode suite headed:

```bash
npm run test:e2e:headed
```

## Contributor checklist

Before opening a PR:

1. Run `npm run lint`.
2. Run `npm run build:esm` for runtime/build changes.
3. Run relevant Playwright tests for UI/runtime changes.
4. Update docs when user-facing behavior or workflows change.

## Scope guidance

- Keep changes focused to `@knighted/develop`.
- Preserve CDN-first loading and fallback behavior.
- Avoid editing generated output unless explicitly required.
