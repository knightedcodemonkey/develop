import { cdnImports, importFromCdnWithFallback } from './cdn.js'

let codeMirrorRuntime = null
let codeMirrorRuntimePromise = null

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

const loadCodeMirrorRuntime = async () => {
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

  return runtime
}

const ensureCodeMirrorRuntime = async () => {
  if (codeMirrorRuntime) return codeMirrorRuntime
  if (!codeMirrorRuntimePromise) {
    codeMirrorRuntimePromise = loadCodeMirrorRuntime()
  }

  try {
    const runtime = await codeMirrorRuntimePromise
    codeMirrorRuntime = runtime
    return runtime
  } catch (error) {
    codeMirrorRuntimePromise = null
    throw error
  }
}

export const createCodeMirrorEditor = async ({
  parent,
  value,
  language,
  contentAttributes,
  onChange,
  onFocus,
}) => {
  const runtime = await ensureCodeMirrorRuntime()
  const editorColors = {
    keyword: 'var(--cm-keyword)',
    name: 'var(--cm-name)',
    property: 'var(--cm-property)',
    fn: 'var(--cm-function)',
    constant: 'var(--cm-constant)',
    definition: 'var(--cm-definition)',
    type: 'var(--cm-type)',
    number: 'var(--cm-number)',
    operator: 'var(--cm-operator)',
    string: 'var(--cm-string)',
    comment: 'var(--cm-comment)',
    link: 'var(--cm-link)',
    heading: 'var(--cm-heading)',
    atom: 'var(--cm-atom)',
    invalid: 'var(--cm-invalid)',
    text: 'var(--cm-text)',
    caret: 'var(--cm-caret)',
    gutterBg: 'var(--cm-gutter-bg)',
    gutterBorder: 'var(--cm-gutter-border)',
    gutterText: 'var(--cm-gutter-text)',
    selection: 'var(--cm-selection)',
    activeLine: 'var(--cm-active-line)',
    focusRing: 'var(--cm-focus-ring)',
    tooltipBg: 'var(--cm-tooltip-bg)',
    tooltipText: 'var(--cm-tooltip-text)',
    tooltipBorder: 'var(--cm-tooltip-border)',
    tooltipItem: 'var(--cm-tooltip-item)',
    tooltipItemSelectedBg: 'var(--cm-tooltip-item-selected-bg)',
    tooltipItemSelectedText: 'var(--cm-tooltip-item-selected-text)',
  }

  const languageCompartment = new runtime.Compartment()
  const editorHighlightStyle = runtime.HighlightStyle.define([
    { tag: runtime.tags.keyword, color: editorColors.keyword, fontWeight: '600' },
    { tag: [runtime.tags.name, runtime.tags.deleted], color: editorColors.name },
    {
      tag: [runtime.tags.character, runtime.tags.propertyName, runtime.tags.macroName],
      color: editorColors.property,
    },
    {
      tag: [runtime.tags.function(runtime.tags.variableName), runtime.tags.labelName],
      color: editorColors.fn,
    },
    {
      tag: [
        runtime.tags.color,
        runtime.tags.constant(runtime.tags.name),
        runtime.tags.standard(runtime.tags.name),
      ],
      color: editorColors.constant,
    },
    {
      tag: [runtime.tags.definition(runtime.tags.name), runtime.tags.separator],
      color: editorColors.definition,
    },
    {
      tag: [runtime.tags.className, runtime.tags.typeName],
      color: editorColors.type,
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
      color: editorColors.number,
    },
    {
      tag: [runtime.tags.operator, runtime.tags.operatorKeyword],
      color: editorColors.operator,
    },
    {
      tag: [runtime.tags.string, runtime.tags.special(runtime.tags.string)],
      color: editorColors.string,
    },
    {
      tag: [runtime.tags.meta, runtime.tags.comment],
      color: editorColors.comment,
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
      color: editorColors.link,
      textDecoration: 'underline',
    },
    {
      tag: runtime.tags.heading,
      color: editorColors.heading,
      fontWeight: '700',
    },
    {
      tag: [
        runtime.tags.atom,
        runtime.tags.bool,
        runtime.tags.special(runtime.tags.variableName),
      ],
      color: editorColors.atom,
    },
    {
      tag: runtime.tags.invalid,
      color: editorColors.invalid,
      textDecoration: `underline wavy ${editorColors.invalid}`,
    },
  ])
  const editorTheme = runtime.EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: editorColors.text,
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
      caretColor: editorColors.caret,
    },
    '.cm-gutters': {
      backgroundColor: editorColors.gutterBg,
      borderRight: `1px solid ${editorColors.gutterBorder}`,
      color: editorColors.gutterText,
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 10px 0 14px',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: editorColors.caret,
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: editorColors.selection,
    },
    '&.cm-focused .cm-activeLine': {
      backgroundColor: editorColors.activeLine,
    },
    '&.cm-focused': {
      outline: `1px solid ${editorColors.focusRing}`,
    },
    '.cm-tooltip': {
      backgroundColor: editorColors.tooltipBg,
      color: editorColors.tooltipText,
      border: `1px solid ${editorColors.tooltipBorder}`,
    },
    '.cm-tooltip-autocomplete > ul > li': {
      color: editorColors.tooltipItem,
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: editorColors.tooltipItemSelectedBg,
      color: editorColors.tooltipItemSelectedText,
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
      ...(contentAttributes
        ? [runtime.EditorView.contentAttributes.of(contentAttributes)]
        : []),
      languageCompartment.of(resolveLanguageExtension(runtime, language)),
      editorTheme,
      updateListener,
    ],
  })
  const view = new runtime.EditorView({
    state,
    parent,
  })
  const toDocumentOffset = (line, column = 1) => {
    const normalizedLine = Number.isInteger(line) ? line : Number(line)
    const normalizedColumn = Number.isInteger(column) ? column : Number(column)

    const lineNumber = Number.isFinite(normalizedLine)
      ? Math.max(1, Math.min(normalizedLine, view.state.doc.lines))
      : 1

    const lineInfo = view.state.doc.line(lineNumber)
    const columnOffset = Number.isFinite(normalizedColumn)
      ? Math.max(0, normalizedColumn - 1)
      : 0

    return Math.min(lineInfo.from + columnOffset, lineInfo.to)
  }

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
    revealPosition: ({ line, column = 1 } = {}) => {
      const anchor = toDocumentOffset(line, column)

      view.dispatch({
        selection: {
          anchor,
          head: anchor,
        },
        effects:
          typeof runtime.EditorView.scrollIntoView === 'function'
            ? runtime.EditorView.scrollIntoView(anchor, {
                y: 'center',
              })
            : [],
      })
      view.focus()
    },
    destroy: () => view.destroy(),
  }
}
