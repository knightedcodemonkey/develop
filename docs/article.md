---
title: 'Forget The Build Step: A Browser-Native Editor For JSX + CSS'
published: true
description: '@knighted/develop is a browser-native editor for JSX and CSS — compile, lint, typecheck, and sync to GitHub without a local build step.'
tags: javascript, webdev, showdev, react
---

Frontend tooling is incredibly capable.

It is also often front-loaded.

For many UI ideas, the first thing you do is not write code. You install, configure, and wait. The creative loop starts late.

[@knighted/develop](https://github.com/knightedcodemonkey/develop) is built for a different default: fast prototyping from anywhere you can open a browser.

It is a browser-native editor/workbench for [@knighted/jsx](https://github.com/knightedcodemonkey/jsx) and [@knighted/css](https://github.com/knightedcodemonkey/css), delivered through CDN ESM with mode-aware loading.

## The Loop, In Practice

Open the app, spin up isolated workspaces, edit multiple files in dynamic tabs, switch render/style modes, run lint/type diagnostics, and preview instantly.

No local bundler is required for that inner loop.

In DOM mode, JSX expressions resolve to real DOM nodes — no virtual DOM, no diffing, no reconciler. Here is a countdown timer that offloads its tick to a Web Worker and mutates the element JSX returned directly:

```tsx
export const App = () => {
  // <div> resolves to a real HTMLDivElement; the cast reflects the runtime type
  const counterEl = (
    <div style="font-size: 5rem; font-weight: bold;">100</div>
  ) as HTMLDivElement

  const workerCode = `
    let startTime = performance.now();
    let ticks = 0;
    function tick() {
      ticks++;
      self.postMessage(100 - ticks);
      if (ticks < 100) {
        setTimeout(tick, 1000 - ((performance.now() - startTime) - (ticks * 1000)));
      }
    }
    tick();
  `

  const worker = new Worker(
    URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })),
  )

  worker.onmessage = e => {
    counterEl.textContent = String(e.data)
    if (e.data <= 0) worker.terminate()
  }

  return (
    <div style="display:flex; justify-content:center; background:#12141c; color:#fff; height:100vh; align-items:center;">
      {counterEl}
    </div>
  )
}
```

## What The App Gives You

- **Multiple Workspaces:** Create and switch between isolated projects without losing your current files.
- **Dynamic Tabbed Editing:** Add, rename, remove, and protect required entry tabs within any workspace.
- **Instant Share URLs:** Encode the current workspace state into a URL you can share or bookmark.
- **Direct GitHub Synchronization:** Open pull requests and push commits from the browser.
- **Render Mode Switch:** Toggle instantly between DOM or React runtimes.
- **Style Mode Switch:** Support for CSS, CSS Modules, Less, and Sass.
- **Live Preview:** Real-time updates with iframe-isolated style encapsulation.
- **In-Browser Diagnostics:** Full lint and type diagnostics with jump-to-source navigation.
- **AI Integration:** Chat with tab-aware edit proposals and explicit apply/undo controls.

The goal is a complete iteration loop without switching tools: edit, check, preview, and sync.

## Why `@knighted/jsx` + `@knighted/css` Matter Here

The app demonstrates both libraries in realistic authoring conditions:

- `@knighted/jsx` provides a direct path from JSX to rendered output, including DOM-first workflows.
- `@knighted/css` handles modern browser-side style compilation, including Modules/Less/Sass modes.

Together they show what a browser can handle natively when you stop routing everything through a local build tool.

## "Compiler-as-a-Service" Without A Build Farm

In this project, Compiler-as-a-Service means:

- CDN delivers modules and WASM artifacts.
- The browser session performs compile, lint, typecheck, render, and editor interactions locally.

It is service-oriented distribution with local execution. Mode-aware loading means you only download what you use: skip Sass mode and the Sass bundle never loads.

## Why This Matters

This does not replace production pipelines — it removes the setup cost for exploratory work where a full project scaffold is overkill.

The loop is complete enough for real component work: write, render, diagnose, push. If you can share a URL or open a PR from the same tab you are editing in, the feedback cycle gets shorter.

For prototyping and focused component work, that is worth something.

## Try It

> **Note:** The app loads its compiler and runtime from CDN on first visit. If something fails to initialize, a hard reload (`Cmd/Ctrl + Shift + R`) is usually enough to recover.

- Live workbench: https://knightedcodemonkey.github.io/develop/
- Source: https://github.com/knightedcodemonkey/develop

If you want a fast product tour, try this sequence:

1. Spin up a new workspace or add a new file tab, rename it, and make an edit.
2. Toggle DOM -> React render mode.
3. Toggle CSS -> Modules -> Less -> Sass style mode.
4. Open diagnostics and jump to a reported line.
5. Copy a Share URL to send your current workspace state to someone else.
6. Connect your GitHub personal access token (BYOT) to run an Open PR or Push Commit.
7. Ask chat for a targeted tab update, then apply it.

That covers most of what the app does.
