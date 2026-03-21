# Forget The Build Step: A Browser-Native IDE For JSX + CSS

Frontend tooling has become incredibly capable.

It has also become very heavy.

For many UI experiments, the first thing you do is not write code. You install dependencies, run a dev server, wait for transforms, and only then start iterating.

I wanted to try a different baseline:

What if the browser is the dev environment?

That idea became [@knighted/develop](https://github.com/knightedcodemonkey/develop).

It is a lightweight in-browser IDE built to showcase [@knighted/jsx](https://github.com/knightedcodemonkey/jsx) and [@knighted/css](https://github.com/knightedcodemonkey/css), with dependencies delivered over CDN ESM instead of requiring a local build step in the inner loop.

## The Loop, In Practice

Open a page, write JSX and styles, switch rendering/style modes, run lint/typecheck, and see results immediately.

No local bundler needed for that loop.

## What Makes It Fun To Use

The app is intentionally practical, not just a demo shell:

- Render mode switch: DOM or React
- Style mode switch: CSS, CSS Modules, Less, Sass
- Live preview with ShadowRoot toggle
- In-browser lint and type diagnostics
- Diagnostics drawer with jump-to-line navigation (mouse or keyboard)

So it is not only "can this compile?" It is closer to "can I actually iterate on a component quickly?"

## Why `@knighted/jsx` + `@knighted/css` Matter Here

`@knighted/develop` is primarily a showcase app.

It demonstrates how these libraries behave in a real authoring environment:

- `@knighted/jsx` gives you a direct path from JSX to rendered output, including DOM-first workflows.
- `@knighted/css` handles modern style pipelines in-browser, including Modules/Less/Sass.

Using both together in one interface makes the bigger point obvious: modern browsers can do much more of the compile/authoring cycle than we usually ask them to.

## "Compiler-as-a-Service" Without A Backend Build Farm

In this project, Compiler-as-a-Service means:

- CDN handles module and WASM delivery.
- The browser tab does the actual compile, lint, typecheck, and render work.

It is service-oriented distribution, local execution.

And because loading is mode-aware, you only pay for what you use. If you never touch Sass, you never load Sass.

## Why This Matters

This is not trying to replace production pipelines.

It is about lowering the cost of exploration.

When the setup tax drops, you try more ideas. When feedback is instant, you discover faster. And when the browser is the platform, sharing a repro can be as easy as sharing a URL.

For prototyping and component iteration, that is a meaningful shift.

## Try It

- Live IDE: https://knightedcodemonkey.github.io/develop/
- Source: https://github.com/knightedcodemonkey/develop

If you are curious, start by toggling:

1. DOM -> React render mode
2. CSS -> Modules -> Less -> Sass style mode
3. ShadowRoot on/off

That sequence tells the story better than any architecture diagram.
