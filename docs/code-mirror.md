# CodeMirror Integration

This document defines how CodeMirror is integrated in @knighted/develop and what constraints must be preserved when changing editor behavior.

## Scope

CodeMirror is used for both authoring panels:

- Component panel (JSX source)
- Styles panel (CSS, CSS Modules, Less, Sass source)

The integration is CDN-first and must keep textarea fallback behavior.

## Integration Files

- `src/cdn.js`: CDN import keys and provider candidates
- `src/editor-codemirror.js`: shared CodeMirror runtime + editor factory
- `src/app.js`: editor initialization, fallback handling, and value wiring
- `src/styles.css`: editor host styling

## Runtime Model

The app initializes CodeMirror asynchronously.

- On success: both textareas are hidden and CodeMirror views are mounted.
- On failure: textareas remain active and the app keeps rendering normally.

This fallback is required. Editor failures must never block rendering.

## CDN Rules

CodeMirror packages are loaded with `importFromCdnWithFallback` and entries in `cdnImportSpecs`.

### Important: esm.sh specifier strategy

Use unversioned `esm` specifiers for the CodeMirror package group:

- `@codemirror/state`
- `@codemirror/view`
- `@codemirror/commands`
- `@codemirror/autocomplete`
- `@codemirror/language`
- `@codemirror/lang-javascript`
- `@codemirror/lang-css`

Reason: this lets esm.sh resolve one compatible dependency graph. Mixing pinned versions can load multiple `@codemirror/state` instances and trigger:

- `Unrecognized extension value in extension set ([object Object])`

Keep `jspmGa` candidates as fallback entries.

## Editor Behavior Baseline

`src/editor-codemirror.js` should continue to include these extensions:

- line numbers
- active line and gutter highlight
- bracket matching
- close brackets
- autocompletion
- syntax highlighting
- history keymap
- default keymap
- completion keymap
- close-bracket keymap
- `indentOnInput`
- tab size and indent unit

Language mapping should remain:

- component editor: `javascript-jsx`
- styles editor:
  - `css` and `module` -> css language
  - `less` -> less language
  - `sass` -> sass language

## App Wiring Requirements

In `src/app.js`:

- Keep `getJsxSource()` and `getCssSource()` abstraction so both CodeMirror and textarea fallback paths work.
- Keep `initializeCodeEditors()` non-blocking (`void initializeCodeEditors()`).
- Keep style language reconfiguration on style mode change.
- Keep textarea input listeners in place for fallback mode.

## Validation Checklist

When modifying editor integration:

1. Run `npm run lint`.
2. Run `npm run dev` and verify:
   - CodeMirror mounts in both panels.
   - Textareas are hidden on success.
   - Auto-close and indentation work while typing.
   - Style mode change reconfigures language and still renders.
   - Fallback path works if a CodeMirror import fails.
3. Run `npm run build` when CDN import keys are changed.

## Troubleshooting

If the UI still looks like plain textarea behavior:

1. Check for `.cm-editor` nodes in devtools.
2. Check whether `textarea.source-textarea--hidden` is present.
3. Check status text for editor fallback message.
4. Hard reload to clear cached CDN module responses.
5. Inspect console for duplicate-state error:
   - `Unrecognized extension value in extension set ([object Object])`

If duplicate-state error returns, first verify `esm` CodeMirror specifiers in `src/cdn.js` are still unversioned for the full package group.
