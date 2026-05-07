<h1>
	<img src="src/logo.svg" alt="@knighted/develop logo" width="32" height="32" valign="middle" />
	<code>@knighted/develop</code>
</h1>

CDN-first UI component workbench for rapid prototyping with [`@knighted/jsx`](https://github.com/knightedcodemonkey/jsx) and [`@knighted/css`](https://github.com/knightedcodemonkey/css).

![Animated flow showing editing, diagnostics, jump-to-source, and fix loop](docs/media/develop-ide-flow.gif)

## What it is

`@knighted/develop` is a browser-native component editor/workbench for fast
UI iteration without a local bundler-first inner loop.

The app is designed to showcase two libraries:

- [`@knighted/jsx`](https://github.com/knightedcodemonkey/jsx) for DOM-first and React-mode JSX authoring
- [`@knighted/css`](https://github.com/knightedcodemonkey/css) for in-browser CSS compilation workflows

Dependencies are delivered over CDN ESM with on-demand loading by mode, so the
browser acts as the runtime host for editing, render, lint, and typecheck flows.

## Core capabilities

`@knighted/develop` lets you:

- write component code in dynamic editor tabs in the browser
- add, rename, and remove tabs with entry-role protection for required tabs
- keep per-tab dirty/synced state while iterating across files
- switch render mode between DOM and React
- switch style mode between native CSS, CSS Modules, Less, and Sass
- run in-browser lint and type diagnostics
- open diagnostics in a shared drawer and jump to source locations
- use iframe-isolated preview style encapsulation while iterating
- connect a GitHub repository and run Open PR / Push Commit workflows
- use AI chat with tab-aware proposals and apply/undo controls
- switch theme and collapse the preview panel while preserving fast feedback loops

## CSS Query Imports In Editor Tabs

`@knighted/develop` supports `@knighted/css` query syntax in workspace tabs, including:

- `./styles/button.module.css?knighted-css`
- `./button.tsx?knighted-css&combined`

For Lit + React-in-Shadow-DOM flows, a minimal pattern is:

1. In `button.tsx`, export your React component and import CSS Modules normally.
2. In `lit-host.ts`, import from `./button.tsx?knighted-css&combined` and use `knightedCss`.
3. Apply `unsafeCSS(knightedCss)` in `static styles` so styles render inside the shadow root.

Example imports:

- `import { ReactButton, knightedCss } from './button.tsx?knighted-css&combined'`
- `import { LitElement, css, html, unsafeCSS } from 'lit'`

`knightedCssModules` is optional for this flow and is not required when you only need
the compiled CSS text plus your component exports.

## Why this shape

The app started as a focused compile-and-preview loop and has grown into a
more complete browser-native editor surface. The goal is still fast
experimentation, now with practical multi-file editing and repository workflows
in the same UI.

## Try it

- Live workbench: https://knightedcodemonkey.github.io/develop/
- Source repository: https://github.com/knightedcodemonkey/develop

## BYOT Guide

- GitHub PAT setup and usage: [docs/byot.md](docs/byot.md)

## Fine-Grained PAT Quick Setup

For PR/BYOT and AI chat flows, use a fine-grained GitHub PAT and follow the
existing setup guide:

- Full setup and behavior: [docs/byot.md](docs/byot.md)
- Repository permissions screenshot: [docs/media/byot-repo-perms.png](docs/media/byot-repo-perms.png)
- Models permission screenshot: [docs/media/byot-model-perms.png](docs/media/byot-model-perms.png)

## License

MIT
