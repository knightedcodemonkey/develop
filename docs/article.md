# Forget The Build Step: Building A Compiler-as-a-Service Playground

In modern frontend development, we have normalized a heavy local setup cost. Want JSX and modern CSS dialects? Install a large dependency graph, start a dev server, and wait for transpilation loops before you can really iterate.

I wanted to test a different path: what if we removed the terminal from the inner loop?

That experiment became @knighted/develop, a browser-native playground that treats your tab as a real-time compiler host.

## The Core Idea

Most playgrounds rely on a backend build service. @knighted/develop flips that model:

- JSX compilation and execution happen in the browser.
- CSS transforms (including CSS Modules, Less, and Sass) run in the browser.
- Compilers are loaded on demand from CDN sources.

The result is a development loop that feels direct: type, compile, render, repeat.

## The Stack Behind It

Two libraries power the runtime:

- @knighted/jsx: JSX that resolves to real DOM nodes.
  - No virtual DOM requirement.
  - You can use declarative JSX and imperative DOM APIs in the same flow.
- @knighted/css: A browser-capable CSS compiler pipeline.
  - Supports native CSS, CSS Modules, Less, and Sass.
  - Uses WASM-backed tooling for modern transforms.

Under the hood, the app leans on CDN resolution and lazy loading, so it fetches compiler/runtime pieces only when a mode needs them.

## Why "Compiler-as-a-Service"?

Compiler-as-a-Service here does not mean a remote build cluster.

It means the service boundary is split between:

- global CDN infrastructure (module and WASM delivery), and
- the user device (actual compilation and execution).

If you switch into Sass mode, the browser loads Sass support. If you stay in native CSS mode, it does not pay that cost. The compiler behaves like an on-demand service, but the work stays local to the tab.

## What This Enables

- Fast feedback loops
  - Rendering updates track edits with minimal overhead.
- Mixed declarative and imperative workflows
  - Useful for low-level UI experiments and DOM-heavy component prototypes.
- Isolation testing with ShadowRoot
  - Toggle encapsulation to verify style boundary behavior.
- Zero install inner loop
  - Open a page and start building.

## Why This Matters

The point is not to replace every production build pipeline.

The point is to prove a stronger baseline: modern browsers are now capable enough to host substantial parts of the authoring and compile cycle directly, without defaulting to local toolchain setup for every experiment.

For prototyping and component iteration, that changes the cost model dramatically.

## Try It

- Live playground: https://knightedcodemonkey.github.io/develop/
- Source repository: https://github.com/knightedcodemonkey/develop

## Notes For Publishing

If you post this on Medium (or similar), include a short screen recording that shows:

- switching style modes (CSS -> Modules -> Less -> Sass),
- toggling ShadowRoot on and off, and
- immediate preview updates while typing.

That visual sequence communicates the Compiler-as-a-Service model faster than any architecture diagram.
