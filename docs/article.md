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

In DOM mode, JSX expressions resolve to real DOM nodes — no virtual DOM, no diffing, no reconciler. Tabs are standard ESM modules too, so your entry tab can import from sibling tabs with relative paths:

`App.tsx`

```tsx
import { Counter } from './Counter.js'

export const App = () => (
  <main>
    <Counter label="Clicks" />
  </main>
)
```

`Counter.tsx`

```tsx
import '../styles/app.css'

type CounterProps = {
  label: string
}

export const Counter = ({ label }: CounterProps) => {
  const el = (
    <button class="counter-button" type="button">
      {label}: 0
    </button>
  ) as HTMLButtonElement
  let count = 0

  el.onclick = () => {
    count += 1
    el.textContent = `${label}: ${count}`
    el.classList.toggle('is-even', count % 2 === 0)
  }

  return el
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
- Worker DOM snapshot (Share URL): [Open workspace example](https://knightedcodemonkey.github.io/develop/?sws=H4sIAAAAAAAAE4VWYW_bNhD9Kwd2m-1VkqXUdVM5SpumHVYsWYskxT7UxUJTJ5kJRQokbdc1_N8HklacpN1mwLZ4vHs8vnt39oYsURuuJMmziDDVtBpNWJP6G29JRJhGarE8sSTPXhw-H2ejLB2n6bOIGElbM1eW5BvCS5KTlfm7epaVmLGX8fj5GOMRKw_il-noMD4o8RDT6vBFOUYSEbNoURsssXzvAklEVkrfmpYyvGSqRZIToRgV9zf-wHVnzvMKqY1dvkqitHFZ1i9iJkaGRERjqwLmjBqH1FAuSUTmSN1ZLnL448hW_7loZqhJLhdCuPUVt8JB_KX0LWp4--Hcu50qafGrvbTUul0uKbN8if5wWaI-V6Wzl6ohEamUtKfGfNKC5GRubWvy4dAZTVIrVQukLTcJU82QGXPwqqINF-vivbSoc26piFRrvkWrem5fp1E2SpJnB1GWpknyMk0n2WPLL7v4CzVTVgWALvZeUOddctMKui7MirpiWzozJP-8qydKq9ckIpI27jonbZtY89UxQO2c5MRotmfSDPf7gsp6QWsXdEOX1DDNWxvf-D2tPKMdNjcngbvc6gVGxDCthCB56uQoLUpLcvdkLJy0LRTQH0BxDJupBAhmphaOq3cCCjgq-RKMXQsspp742PBvmMNzjc0EvGGFvJ7bHGZKlJMpOc7S9GhY8uUxUAO_X52fveXLdwIblHayP2TlBXCqSoQCrp0dQKAFY6m2V7xx5hZ1pXRDJcNEqlV_MNn7Wc5uDRSQ7mzVQjLLlfQb_UG4j3t5x6dPJ93aoKiSVhl7jsbQGvtZmkIc3AZ3XryCfjjiCLI0vYfnEHyCamG9S-QcHES__13CEO8v5BY7zF99yGCwP28bHnZf4Q5-8_o7zqAAiSsIHdT_dHGWhInyYXaDzH66OOu77TdCzfqf9yx_iWADdt1iDj3atoIz6uga7uXUg23IyB0YAhMlm8CS0wnuhQJ7kSSucU-DsqCAS6u5rPuYlNTS7n6OzWCBowLSQQdvUTdcUou7y279p3trtAstH8pv11p5JfDrBG4WxvJqHe9EnTN0-UxgRtltrdVClvmT7CAbZWwCTAml8ydVVU1gHuSapelyPgEqeC1jbrExHcKUHG_ubrcNUp5M5Xbi21nXaD_q37jAj__Ts9y85dqu7_pwLVmY-mEWCmrspbddYKMsXs5ptxVcT--6lTet0hZ6STL0XJghbduEGdNzxXJFhdOQ8JuFtUp-1Kp1veFLJegMRQ7G18UZlDwVnN3m0MelIw7O1cLgO_fsC7xUvJzKrYMOsnuA7YSwCaBRBwXb_AcJeLC-O_FoFkKZoMYUU7JjNw7mKfG6LKbkbr3DLTa7h-1x0NHGn-ub5GgYvI-ncrBP9buJ5kaFP86Nin0nzaksBYbki38j4r7S4WkBWbd2CLOODR-bsIXWKO2V10c3-AIZu9kXgkPYo5659omYHH4KwtteP3B2fWPQJuE3EYpdRj_DARRFASm8gl5FhcEe5NBzaus9iPe0n3FjE6vqWmC_x03s0u5Fj6EGvgvDCOha8GH5fQWKXpdx2tsX6x6pWxgeew2RIPRzVfKKY_noL8_2S0TCra7o7P39X8jHf5LS8Xh0cHh4-N9w238AZi93_38JAAA)

If you want a fast product tour, try this sequence:

1. Spin up a new workspace or add a new file tab, rename it, and make an edit.
2. Toggle DOM -> React render mode.
3. Toggle CSS -> Modules -> Less -> Sass style mode.
4. Open diagnostics and jump to a reported line.
5. Copy a Share URL to send your current workspace state to someone else.
6. Connect your GitHub personal access token (BYOT) to run an Open PR or Push Commit.
7. Ask chat for a targeted tab update, then apply it.

That covers most of what the app does.
