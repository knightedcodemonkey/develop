<h1>
	<img src="src/logo.svg" alt="@knighted/develop logo" width="32" height="32" valign="middle" />
	<code>@knighted/develop</code>
</h1>

CDN-first browser IDE for building UI components with [`@knighted/jsx`](https://github.com/knightedcodemonkey/jsx) and [`@knighted/css`](https://github.com/knightedcodemonkey/css).

![Animated flow showing editing, diagnostics, jump-to-source, and fix loop](docs/media/develop-ide-flow.gif)

## What it is

`@knighted/develop` is a browser-native IDE that demonstrates modern component
authoring without a local bundler-first inner loop.

The app is designed to showcase two libraries:

- [`@knighted/jsx`](https://github.com/knightedcodemonkey/jsx) for DOM-first and React-mode JSX authoring
- [`@knighted/css`](https://github.com/knightedcodemonkey/css) for in-browser CSS compilation workflows

Dependencies are delivered over CDN ESM with on-demand loading by mode, so the
browser acts as the runtime host for render, lint, and typecheck flows.

## Core capabilities

`@knighted/develop` lets you:

- write component code in the browser
- switch render mode between DOM and React
- switch style mode between native CSS, CSS Modules, Less, and Sass
- run in-browser lint and type diagnostics
- open diagnostics in a shared drawer and jump to source locations
- toggle ShadowRoot preview isolation while iterating
- switch layout and theme while preserving fast feedback loops

## Try it

- Live IDE: https://knightedcodemonkey.github.io/develop/
- Source repository: https://github.com/knightedcodemonkey/develop

## BYOT Guide

- GitHub PAT setup and usage: [docs/byot.md](docs/byot.md)

## Fine-Grained PAT Quick Setup

For AI/BYOT flows, use a fine-grained GitHub PAT and follow the existing setup guide:

- Full setup and behavior: [docs/byot.md](docs/byot.md)
- Repository permissions screenshot: [docs/media/byot-repo-perms.png](docs/media/byot-repo-perms.png)
- Models permission screenshot: [docs/media/byot-model-perms.png](docs/media/byot-model-perms.png)

## License

MIT
