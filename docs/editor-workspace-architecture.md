# Editor Workspace Architecture

This document describes the current workspace-first editor model in `@knighted/develop`.

## Overview

- Workspace tabs are the source of truth for editor identity and content.
- Tab metadata controls behavior, including entry resolution via `role: 'entry'`.
- The default workspace starts with:
  - `src/components/App.tsx` (entry tab)
  - `src/styles/app.css` (style tab)
- Only one editor panel is visible at a time in the current UI.
- The preview compiles from the resolved entry tab and hydrates workspace module tabs.

## Tab UX

- Selecting any tab activates and reveals the matching editor content.
- Add tab now requests an explicit tab name during creation.
- Rename is first-class with a dedicated rename action on each tab.
- Remove is available for non-entry tabs only.

## Persistence Model

- Workspace tab state is stored in IndexedDB workspace records.
- Tab records persist tab role (`entry` or `module`) so entry behavior survives reload.
- Local storage is intentionally limited to app/theme controls and GitHub integration state:
  - BYOT token and selected repository
  - PR drawer repository-scoped configuration
  - layout/theme preferences

## Migration Summary

### Removed

- Legacy DOM and CSS selectors tied to fixed `component-panel` and `styles-panel` naming.
- Panel-era CSS branches that depended on those legacy class names.

### Intentionally Legacy (for integration boundaries)

- Distinct component/styles tool controls remain because diagnostics, lint actions, and PR sync flows still expose separate component and styles actions.
- Collapse control keys still use `component` and `styles` internally for stable behavior and test coverage.

### Follow-up

- Introduce an optional dual-editor split/pin layout without changing tab identity and persistence semantics.
