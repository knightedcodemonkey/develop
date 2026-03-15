import { cdnImports, importFromCdnWithFallback } from './cdn.js'

let codeMirrorRuntime = null

const resolveLanguageExtension = (runtime, language) => {
  if (language === 'javascript-jsx') {
    return runtime.javascript({ jsx: true })
  }

  if (language === 'less' && typeof runtime.less === 'function') {
    return runtime.less()
  }

  if (language === 'sass' && typeof runtime.sass === 'function') {
    return runtime.sass()
  }

  return runtime.css()
}

const ensureCodeMirrorRuntime = async () => {
  if (codeMirrorRuntime) return codeMirrorRuntime

  const [
    state,
    view,
    commands,
    autocomplete,
    language,
    lezerHighlight,
    langJavascript,
    langCss,
  ] = await Promise.all([
    importFromCdnWithFallback(cdnImports.codemirrorState),
    importFromCdnWithFallback(cdnImports.codemirrorView),
    importFromCdnWithFallback(cdnImports.codemirrorCommands),
    importFromCdnWithFallback(cdnImports.codemirrorAutocomplete),
    importFromCdnWithFallback(cdnImports.codemirrorLanguage),
    importFromCdnWithFallback(cdnImports.codemirrorLezerHighlight),
    importFromCdnWithFallback(cdnImports.codemirrorLangJavascript),
    importFromCdnWithFallback(cdnImports.codemirrorLangCss),
  ])

  const runtime = {
    Compartment: state.module.Compartment,
    EditorState: state.module.EditorState,
    EditorView: view.module.EditorView,
    keymap: view.module.keymap,
    lineNumbers: view.module.lineNumbers,
    highlightActiveLineGutter: view.module.highlightActiveLineGutter,
    drawSelection: view.module.drawSelection,
    highlightActiveLine: view.module.highlightActiveLine,
    highlightSpecialChars: view.module.highlightSpecialChars,
    defaultKeymap: commands.module.defaultKeymap,
    history: commands.module.history,
    historyKeymap: commands.module.historyKeymap,
    indentWithTab: commands.module.indentWithTab,
    closeBrackets: autocomplete.module.closeBrackets,
    closeBracketsKeymap: autocomplete.module.closeBracketsKeymap,
    autocompletion: autocomplete.module.autocompletion,
    completionKeymap: autocomplete.module.completionKeymap,
    HighlightStyle: language.module.HighlightStyle,
    syntaxHighlighting: language.module.syntaxHighlighting,
    bracketMatching: language.module.bracketMatching,
    indentOnInput: language.module.indentOnInput,
    indentUnit: language.module.indentUnit,
    tags: lezerHighlight.module.tags,
    javascript: langJavascript.module.javascript,
    css: langCss.module.css,
    less: langCss.module.less,
    sass: langCss.module.sass,
  }

  if (
    typeof runtime.Compartment !== 'function' ||
    typeof runtime.EditorState !== 'function' ||
    typeof runtime.EditorView !== 'function' ||
    typeof runtime.keymap?.of !== 'function' ||
    typeof runtime.history !== 'function' ||
    typeof runtime.closeBrackets !== 'function' ||
    !Array.isArray(runtime.closeBracketsKeymap) ||
    typeof runtime.autocompletion !== 'function' ||
    !Array.isArray(runtime.completionKeymap) ||
    !runtime.HighlightStyle ||
    typeof runtime.syntaxHighlighting !== 'function' ||
    typeof runtime.indentOnInput !== 'function' ||
    !runtime.indentUnit ||
    !runtime.tags ||
    typeof runtime.javascript !== 'function' ||
    typeof runtime.css !== 'function'
  ) {
    throw new Error('CodeMirror runtime did not expose expected APIs.')
  }

  codeMirrorRuntime = runtime
  return runtime
}

export const createCodeMirrorEditor = async ({
  parent,
  value,
  language,
  onChange,
  onFocus,
}) => {
  const runtime = await ensureCodeMirrorRuntime()
  const languageCompartment = new runtime.Compartment()
  const editorHighlightStyle = runtime.HighlightStyle.define([
    { tag: runtime.tags.keyword, color: '#ff7fb3', fontWeight: '600' },
    { tag: [runtime.tags.name, runtime.tags.deleted], color: '#e7ecf9' },
    {
      tag: [runtime.tags.character, runtime.tags.propertyName, runtime.tags.macroName],
      color: '#3fd6a6',
    },
    {
      tag: [runtime.tags.function(runtime.tags.variableName), runtime.tags.labelName],
      color: '#8dc8ff',
    },
    {
      tag: [
        runtime.tags.color,
        runtime.tags.constant(runtime.tags.name),
        runtime.tags.standard(runtime.tags.name),
      ],
      color: '#7fd7ff',
    },
    {
      tag: [runtime.tags.definition(runtime.tags.name), runtime.tags.separator],
      color: '#dce4f6',
    },
    {
      tag: [runtime.tags.className, runtime.tags.typeName],
      color: '#8eb8ff',
      fontWeight: '600',
    },
    {
      tag: [
        runtime.tags.number,
        runtime.tags.changed,
        runtime.tags.annotation,
        runtime.tags.modifier,
        runtime.tags.self,
        runtime.tags.namespace,
      ],
      color: '#ffcb82',
    },
    {
      tag: [runtime.tags.operator, runtime.tags.operatorKeyword],
      color: '#d5def0',
    },
    {
      tag: [runtime.tags.string, runtime.tags.special(runtime.tags.string)],
      color: '#ffd38e',
    },
    {
      tag: [runtime.tags.meta, runtime.tags.comment],
      color: '#94a2bb',
      fontStyle: 'italic',
    },
    {
      tag: runtime.tags.strong,
      fontWeight: '700',
    },
    {
      tag: runtime.tags.emphasis,
      fontStyle: 'italic',
    },
    {
      tag: runtime.tags.link,
      color: '#88b6ff',
      textDecoration: 'underline',
    },
    {
      tag: runtime.tags.heading,
      color: '#f2f5ff',
      fontWeight: '700',
    },
    {
      tag: [
        runtime.tags.atom,
        runtime.tags.bool,
        runtime.tags.special(runtime.tags.variableName),
      ],
      color: '#b8a8ff',
    },
    {
      tag: runtime.tags.invalid,
      color: '#ff8fa1',
      textDecoration: 'underline wavy #ff8fa1',
    },
  ])
  const editorTheme = runtime.EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: '#edf2ff',
      fontSize: '0.9rem',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    },
    '.cm-scroller': {
      overflow: 'auto',
      lineHeight: '1.5',
    },
    '.cm-content': {
      padding: '16px 18px',
      minHeight: '100%',
      caretColor: '#f1f5ff',
    },
    '.cm-gutters': {
      backgroundColor: 'rgba(255, 255, 255, 0.045)',
      borderRight: '1px solid rgba(255, 255, 255, 0.13)',
      color: '#98a8c4',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 10px 0 14px',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#f1f5ff',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(122, 107, 255, 0.36)',
    },
    '&.cm-focused .cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    '&.cm-focused': {
      outline: '1px solid rgba(122, 107, 255, 0.62)',
    },
    '.cm-tooltip': {
      backgroundColor: '#1b2233',
      color: '#edf2ff',
      border: '1px solid rgba(152, 168, 196, 0.32)',
    },
    '.cm-tooltip-autocomplete > ul > li': {
      color: '#dce6fa',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'rgba(122, 107, 255, 0.34)',
      color: '#f4f7ff',
    },
  })
  const updateListener = runtime.EditorView.updateListener.of(update => {
    if (update.docChanged && typeof onChange === 'function') {
      onChange(update.state.doc.toString())
    }

    if (update.focusChanged && update.view.hasFocus && typeof onFocus === 'function') {
      onFocus()
    }
  })
  const state = runtime.EditorState.create({
    doc: value,
    extensions: [
      runtime.EditorState.tabSize.of(2),
      runtime.indentUnit.of('  '),
      runtime.lineNumbers(),
      runtime.highlightSpecialChars(),
      runtime.history(),
      runtime.drawSelection(),
      runtime.highlightActiveLine(),
      runtime.highlightActiveLineGutter(),
      runtime.bracketMatching(),
      runtime.closeBrackets(),
      runtime.autocompletion(),
      runtime.indentOnInput(),
      runtime.syntaxHighlighting(editorHighlightStyle),
      runtime.EditorView.lineWrapping,
      runtime.keymap.of([
        runtime.indentWithTab,
        ...runtime.closeBracketsKeymap,
        ...runtime.completionKeymap,
        ...runtime.defaultKeymap,
        ...runtime.historyKeymap,
      ]),
      languageCompartment.of(resolveLanguageExtension(runtime, language)),
      editorTheme,
      updateListener,
    ],
  })
  const view = new runtime.EditorView({
    state,
    parent,
  })

  return {
    getValue: () => view.state.doc.toString(),
    setValue: nextValue => {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: nextValue,
        },
      })
    },
    setLanguage: nextLanguage => {
      view.dispatch({
        effects: languageCompartment.reconfigure(
          resolveLanguageExtension(runtime, nextLanguage),
        ),
      })
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  }
}
