# Build And Deploy

This project uses two runtime modes:

- Local development mode: dynamic CDN resolution from `src/cdn.js` with esm.sh as default.
- Production mode: JSPM-generated import map injected into `dist/index.html` and hosted on GitHub Pages.

## Local Development

Install dependencies and start the local server:

```sh
npm ci
npm run dev
```

The app loads from `src/index.html` and keeps the dynamic CDN fallback behavior for fast iteration and debugging.

## Production Build

Create a production-ready `dist` folder:

```sh
npm run build
```

Select a different production primary CDN at build time:

```sh
KNIGHTED_PRIMARY_CDN=esm npm run build
KNIGHTED_PRIMARY_CDN=jspmGa npm run build
```

Convenience scripts are also available:

```sh
npm run build:esm
npm run build:jspm
npm run build:importmap-mode
```

### Build Mode Matrix

<!-- prettier-ignore-start -->
| Mode | Resolver | Import map step | JSPM index needed | Typical use |
| --- | --- | --- | --- | --- |
| `importMap` | Import map in `dist/index.html` | Yes | Yes | Default production mode |
| `esm` | `src/cdn.js` (`esm.sh` primary) | No | No | Stable fallback mode |
| `jspmGa` | `src/cdn.js` (`ga.jspm.io` primary) | No | No | Direct ga.jspm.io testing |
<!-- prettier-ignore-end -->

Mode notes:

- `importMap`: Preferred production mode when JSPM has indexed the required graph.
- `esm`: Stable fallback mode while waiting on JSPM indexing.
- `jspmGa`: Direct ga.jspm.io URL mode without import-map generation.

This runs two steps:

1. `npm run build:prepare`

- Copies `src` to `dist`
- Injects `window.__KNIGHTED_PRIMARY_CDN__` into `dist/index.html`

2. `npm run build:importmap`

- Runs only when `KNIGHTED_PRIMARY_CDN=importMap`
- Runs `jspm link` with `--provider jspm.io`
- Injects an inline import map into `dist/index.html`
- Adds integrity metadata and modulepreload links
- Pins the following packages through resolution overrides:
  - `sass=1.93.2`
  - `less=4.4.2`
- Traces generated `dist/prod-imports.js`
- Import specifiers come from `importMap` entries in `src/cdn.js` (`cdnImportSpecs`)

Preview the built site locally:

```sh
npm run preview
```

## CI And Deployment

- CI workflow (`.github/workflows/ci.yml`) installs dependencies, runs lint, and runs `npm run build`.
- Deploy workflow (`.github/workflows/deploy.yml`) builds the production site and publishes `dist` to GitHub Pages.

## Notes

- Runtime resolution is import-map first in production (`window.__KNIGHTED_PRIMARY_CDN__ = "importMap"`).
- If a specifier is missing from the generated map, runtime falls back through the CDN
  provider chain configured in `src/cdn.js`.

### Sass Loading Gotchas

- Symptom: switching to Sass mode shows `Unable to load Sass compiler for browser usage: Dynamic require of "url" is not supported`.
- Cause: some `esm.sh` Sass outputs currently include runtime paths that are not browser-safe for this app.
- Current mitigation: `src/cdn.js` keeps `esm.sh` first, then falls back to `unpkg` for Sass via `sass@1.93.2/sass.default.js?module`.
- Important context: this can appear even if the Sass URL has not changed in this repo, because CDN-transformed module output can change upstream.
- If this regresses again:
  - Verify Sass import candidates in `src/cdn.js`.
  - Reproduce directly in browser devtools with `await import('<candidate-url>')`.
  - Keep at least one known browser-safe fallback provider in the Sass candidate list.
