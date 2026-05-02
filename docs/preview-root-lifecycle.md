# knighted-preview-root lifecycle

This document explains why `knighted-preview-root` exists, when it is present in preview, and when it is removed.

## What is it

`knighted-preview-root` is a custom host element created inside the preview iframe document.

It is the dedicated React mount container used by the preview runtime in React render mode.

## Why it exists even with iframe isolation

The iframe isolates user code from the outer develop application, but React still needs a stable mount point inside the iframe document itself.

Using `knighted-preview-root` provides:

- A deterministic mount target for `createRoot(...)`.
- Clear ownership of framework-rendered content within the iframe body.
- Predictable cleanup between render passes.
- A clean separation between React mode behavior and DOM mode behavior.

In short:

- Iframe isolation answers where code runs.
- `knighted-preview-root` answers where React owns the DOM in that isolated page.

## When it is created

`knighted-preview-root` is created only during a successful React-mode render pass:

1. The runtime receives a render request with mode set to React.
2. The entry module is imported successfully.
3. `App` resolves to a callable component.
4. React output is created successfully.
5. A new `knighted-preview-root` element is appended to `document.body`.
6. React mounts into that host via `createRoot(host)`.

## When it is removed

At the beginning of every render pass, the runtime removes existing preview roots and clears previous render state.

That means old `knighted-preview-root` nodes are intentionally deleted before the next render attempt.

If the next render attempt fails before host creation, no new `knighted-preview-root` will be visible for that pass.

## React mode vs DOM mode

React mode:

- Creates `knighted-preview-root`.
- Mounts React output into that host.

DOM mode:

- Does not create `knighted-preview-root`.
- Appends DOM output directly to the iframe `body`.

So it is expected to sometimes not see `knighted-preview-root` when:

- The current render mode is DOM.
- The React render failed before host creation.
- You inspect after cleanup but before a successful remount.

## Portals and notification behavior

In React mode, a portal target such as `document.body` points to the iframe body, not the outer develop UI document.

This is expected and is part of preview encapsulation.

`knighted-preview-root` does not change portal target semantics; it only defines the primary React mount host.

## Quick troubleshooting checklist

If `knighted-preview-root` is missing when you expected it:

1. Confirm render mode is React.
2. Confirm the latest pass did not fail before mount.
3. Confirm you are inspecting the iframe document, not the parent document.
4. Confirm auto-render actually scheduled a new render pass for the tab you edited.
