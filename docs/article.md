# Forget The Build Step: A Browser-Native Editor For JSX + CSS

Frontend tooling is incredibly capable.

It is also often front-loaded.

For many UI ideas, the first thing you do is not write code. You install,
configure, and wait. The creative loop starts late.

[@knighted/develop](https://github.com/knightedcodemonkey/develop) is built
for a different default: fast prototyping from anywhere you can open a browser.

It is a browser-native editor/workbench for
[@knighted/jsx](https://github.com/knightedcodemonkey/jsx) and
[@knighted/css](https://github.com/knightedcodemonkey/css), delivered through
CDN ESM with mode-aware loading.

## The Loop, In Practice

Open the app, edit multiple files in dynamic tabs, switch render/style modes,
run lint/type diagnostics, and preview instantly.

No local bundler is required for that inner loop.

## What The App Gives You

- Dynamic tabbed editing (add, rename, remove, and protect required entry tabs)
- Render mode switch: DOM or React
- Style mode switch: CSS, CSS Modules, Less, Sass
- Live preview with iframe-isolated style encapsulation
- In-browser lint and type diagnostics with jump-to-source navigation
- GitHub-connected workflows for Open PR and Push Commit
- AI chat with tab-aware edit proposals and explicit apply/undo controls

This is not only "can this compile?" It is about shipping the whole iteration
loop in one place: edit, validate, preview, sync, and refine.

## Why `@knighted/jsx` + `@knighted/css` Matter Here

The app demonstrates both libraries in realistic authoring conditions:

- `@knighted/jsx` provides a direct path from JSX to rendered output,
  including DOM-first workflows.
- `@knighted/css` handles modern browser-side style compilation,
  including Modules/Less/Sass modes.

Together they show how much of the authoring cycle modern browsers can run
directly.

## "Compiler-as-a-Service" Without A Build Farm

In this project, Compiler-as-a-Service means:

- CDN delivers modules and WASM artifacts.
- The browser session performs compile, lint, typecheck, render, and editor
  interactions locally.

It is service-oriented distribution with local execution.

Mode-aware loading keeps costs aligned to usage: if you do not use Sass,
Sass does not load.

## Why This Matters

This does not replace production pipelines.

It lowers the cost of exploration while preserving enough workflow surface to
be useful for real component work.

When setup friction drops, teams try more ideas. When feedback is immediate,
they converge faster. When browser-native workspaces can sync to GitHub and
carry chat-assisted edit proposals, collaboration is lighter too.

For prototyping and component development, that is a meaningful shift.

## Try It

- Live workbench: https://knightedcodemonkey.github.io/develop/
- Source: https://github.com/knightedcodemonkey/develop

If you want a fast product tour, try this sequence:

1. Add a new tab, rename it, and make an edit.
2. Toggle DOM -> React render mode.
3. Toggle CSS -> Modules -> Less -> Sass style mode.
4. Open diagnostics and jump to a reported line.
5. Connect BYOT (Bring Your Own Token) by adding a GitHub personal access token, then run Open PR / Push Commit.
6. Ask chat for a targeted tab update, then apply it.

That flow tells the product story better than any architecture diagram.
