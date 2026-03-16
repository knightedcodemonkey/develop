import { cdnImports, getTypeScriptLibUrls, importFromCdnWithFallback } from './cdn.js'
import { createCodeMirrorEditor } from './editor-codemirror.js'
import { defaultCss, defaultJsx } from './defaults.js'

const statusNode = document.getElementById('status')
const appGrid = document.querySelector('.app-grid')
const appGridLayoutButtons = document.querySelectorAll('[data-app-grid-layout]')
const appThemeButtons = document.querySelectorAll('[data-app-theme]')
const renderMode = document.getElementById('render-mode')
const autoRenderToggle = document.getElementById('auto-render')
const typecheckButton = document.getElementById('typecheck-button')
const renderButton = document.getElementById('render-button')
const copyComponentButton = document.getElementById('copy-component')
const clearComponentButton = document.getElementById('clear-component')
const styleMode = document.getElementById('style-mode')
const copyStylesButton = document.getElementById('copy-styles')
const clearStylesButton = document.getElementById('clear-styles')
const shadowToggle = document.getElementById('shadow-toggle')
const jsxEditor = document.getElementById('jsx-editor')
const cssEditor = document.getElementById('css-editor')
const styleWarning = document.getElementById('style-warning')
const diagnosticsToggle = document.getElementById('diagnostics-toggle')
const diagnosticsDrawer = document.getElementById('diagnostics-drawer')
const diagnosticsClose = document.getElementById('diagnostics-close')
const diagnosticsClearComponent = document.getElementById('diagnostics-clear-component')
const diagnosticsClearAll = document.getElementById('diagnostics-clear-all')
const diagnosticsComponent = document.getElementById('diagnostics-component')
const diagnosticsStyles = document.getElementById('diagnostics-styles')
const cdnLoading = document.getElementById('cdn-loading')
const previewBgColorInput = document.getElementById('preview-bg-color')
const clearConfirmDialog = document.getElementById('clear-confirm-dialog')
const clearConfirmTitle = document.getElementById('clear-confirm-title')
const clearConfirmCopy = document.getElementById('clear-confirm-copy')

jsxEditor.value = defaultJsx
cssEditor.value = defaultCss

let previewHost = document.getElementById('preview-host')
let jsxCodeEditor = null
let cssCodeEditor = null
let getJsxSource = () => jsxEditor.value
let getCssSource = () => cssEditor.value
let scheduled = null
let reactRoot = null
let reactRuntime = null
let sassCompiler = null
let lessCompiler = null
let lightningCssWasm = null
let coreRuntime = null
let typeScriptCompiler = null
let typeScriptLibFiles = null
let compiledStylesCache = {
  key: null,
  value: null,
}
let pendingClearAction = null
let hasCompletedInitialRender = false
let previewBackgroundColor = null
let previewBackgroundCustomized = false
let typeCheckRunId = 0
let lastTypeErrorCount = 0
let hasUnresolvedTypeErrors = false
let scheduledTypeRecheck = null
let activeTypeDiagnosticsRuns = 0
let diagnosticsDrawerOpen = false
let suppressEditorChangeSideEffects = false
let statusLevel = 'neutral'
const clipboardSupported = Boolean(navigator.clipboard?.writeText)
const appGridLayoutStorageKey = 'knighted-develop:app-grid-layout'
const appThemeStorageKey = 'knighted-develop:theme'
const defaultTypeScriptLibFileName = 'lib.esnext.full.d.ts'

const styleLabels = {
  css: 'Native CSS',
  module: 'CSS Modules',
  less: 'Less',
  sass: 'Sass',
}

const getStyleEditorLanguage = mode => {
  if (mode === 'less') return 'less'
  if (mode === 'sass') return 'sass'
  return 'css'
}

const createEditorHost = textarea => {
  const host = document.createElement('div')
  host.className = 'editor-host'
  textarea.before(host)
  return host
}

const initializeCodeEditors = async () => {
  const jsxHost = createEditorHost(jsxEditor)
  const cssHost = createEditorHost(cssEditor)

  try {
    const [nextJsxEditor, nextCssEditor] = await Promise.all([
      createCodeMirrorEditor({
        parent: jsxHost,
        value: defaultJsx,
        language: 'javascript-jsx',
        onChange: () => {
          if (suppressEditorChangeSideEffects) {
            return
          }
          maybeRender()
          markTypeDiagnosticsStale()
        },
      }),
      createCodeMirrorEditor({
        parent: cssHost,
        value: defaultCss,
        language: getStyleEditorLanguage(styleMode.value),
        onChange: () => {
          if (suppressEditorChangeSideEffects) {
            return
          }
          maybeRender()
        },
      }),
    ])

    jsxCodeEditor = nextJsxEditor
    cssCodeEditor = nextCssEditor
    getJsxSource = () => jsxCodeEditor.getValue()
    getCssSource = () => cssCodeEditor.getValue()

    jsxEditor.classList.add('source-textarea--hidden')
    cssEditor.classList.add('source-textarea--hidden')
  } catch (error) {
    jsxHost.remove()
    cssHost.remove()
    const message = error instanceof Error ? error.message : String(error)
    setStatus(`Editor fallback: ${message}`)
  }
}

const ensureCoreRuntime = async () => {
  if (coreRuntime) return coreRuntime

  try {
    const [cssBrowser, jsxDom, jsxTranspile] = await Promise.all([
      importFromCdnWithFallback(cdnImports.cssBrowser),
      importFromCdnWithFallback(cdnImports.jsxDom),
      importFromCdnWithFallback(cdnImports.jsxTranspile),
    ])

    if (typeof cssBrowser.module.cssFromSource !== 'function') {
      throw new Error(`cssFromSource export was not found from ${cssBrowser.url}`)
    }

    if (typeof jsxDom.module.jsx !== 'function') {
      throw new Error(`jsx export was not found from ${jsxDom.url}`)
    }

    if (typeof jsxTranspile.module.transpileJsxSource !== 'function') {
      throw new Error(`transpileJsxSource export was not found from ${jsxTranspile.url}`)
    }

    coreRuntime = {
      cssFromSource: cssBrowser.module.cssFromSource,
      jsx: jsxDom.module.jsx,
      transpileJsxSource: jsxTranspile.module.transpileJsxSource,
    }

    return coreRuntime
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown runtime module loading failure'
    throw new Error(`Unable to load core runtime from CDN: ${message}`, {
      cause: error,
    })
  }
}

const inferStatusLevel = text => {
  if (text === 'Rendering…' || text === 'Loading CDN assets…') {
    return 'pending'
  }

  if (
    text === 'Error' ||
    text === 'Copy failed' ||
    text.startsWith('Rendered (Type errors:')
  ) {
    return 'error'
  }

  return 'neutral'
}

const setStatus = (text, level = inferStatusLevel(text)) => {
  statusNode.textContent = text
  statusLevel = level
  updateUiIssueIndicators()
}

const getDiagnosticsErrorCount = () => {
  const componentErrors =
    diagnosticsByScope.component.level === 'error'
      ? diagnosticsByScope.component.lines.length
      : 0
  const styleErrors =
    diagnosticsByScope.styles.level === 'error'
      ? diagnosticsByScope.styles.lines.length
      : 0
  return componentErrors + styleErrors
}

const getDiagnosticsIssueLevel = () => {
  if (getDiagnosticsErrorCount() > 0) {
    return 'error'
  }

  if (activeTypeDiagnosticsRuns > 0) {
    return 'pending'
  }

  return 'neutral'
}

const updateUiIssueIndicators = () => {
  const diagnosticsLevel = getDiagnosticsIssueLevel()

  statusNode.classList.remove('status--neutral', 'status--pending', 'status--error')
  statusNode.classList.add(`status--${statusLevel}`)

  if (diagnosticsToggle) {
    diagnosticsToggle.classList.remove(
      'diagnostics-toggle--neutral',
      'diagnostics-toggle--pending',
      'diagnostics-toggle--error',
    )
    diagnosticsToggle.classList.add(`diagnostics-toggle--${diagnosticsLevel}`)
  }
}

const diagnosticsByScope = {
  component: {
    headline: '',
    lines: [],
    level: 'muted',
  },
  styles: {
    headline: '',
    lines: [],
    level: 'muted',
  },
}

const getDiagnosticsScopeNode = scope => {
  if (scope === 'component') {
    return diagnosticsComponent
  }

  if (scope === 'styles') {
    return diagnosticsStyles
  }

  return null
}

const renderDiagnosticsScope = scope => {
  const root = getDiagnosticsScopeNode(scope)
  const state = diagnosticsByScope[scope]
  if (!root || !state) {
    return
  }

  root.classList.remove('panel-footer--muted', 'panel-footer--ok', 'panel-footer--error')
  root.replaceChildren()

  const hasHeadline = typeof state.headline === 'string' && state.headline.length > 0
  const hasLines = Array.isArray(state.lines) && state.lines.length > 0

  if (!hasHeadline && !hasLines) {
    const emptyNode = document.createElement('div')
    emptyNode.className = 'diagnostics-empty'
    emptyNode.textContent = 'No diagnostics yet.'
    root.append(emptyNode)
    root.classList.add('panel-footer--muted')
    return
  }

  if (hasHeadline) {
    const headingNode = document.createElement('div')
    headingNode.className = 'type-diagnostics-heading'
    headingNode.textContent = state.headline
    root.append(headingNode)
  }

  if (hasLines) {
    const listNode = document.createElement('ol')
    listNode.className = 'type-diagnostics-list'
    for (const line of state.lines) {
      const itemNode = document.createElement('li')
      itemNode.textContent = line
      listNode.append(itemNode)
    }
    root.append(listNode)
  }

  if (state.level === 'ok') {
    root.classList.add('panel-footer--ok')
    return
  }

  if (state.level === 'error') {
    root.classList.add('panel-footer--error')
    return
  }

  root.classList.add('panel-footer--muted')
}

const updateDiagnosticsToggleLabel = () => {
  if (!diagnosticsToggle) {
    return
  }

  const totalErrors = getDiagnosticsErrorCount()
  diagnosticsToggle.textContent =
    totalErrors > 0 ? `Diagnostics (${totalErrors})` : 'Diagnostics'
}

const setDiagnosticsDrawerOpen = isOpen => {
  diagnosticsDrawerOpen = Boolean(isOpen)

  if (diagnosticsDrawer) {
    diagnosticsDrawer.hidden = !diagnosticsDrawerOpen
  }

  if (diagnosticsToggle) {
    diagnosticsToggle.setAttribute(
      'aria-expanded',
      diagnosticsDrawerOpen ? 'true' : 'false',
    )
  }
}

const setDiagnosticsScope = (scope, { headline = '', lines = [], level = 'muted' }) => {
  if (!diagnosticsByScope[scope]) {
    return
  }

  diagnosticsByScope[scope] = {
    headline,
    lines,
    level,
  }

  renderDiagnosticsScope(scope)
  updateDiagnosticsToggleLabel()
  updateUiIssueIndicators()
}

const clearDiagnosticsScope = scope => {
  setDiagnosticsScope(scope, { headline: '', lines: [], level: 'muted' })
}

const clearAllDiagnostics = () => {
  clearDiagnosticsScope('component')
  clearDiagnosticsScope('styles')
}

const setTypeDiagnosticsDetails = ({ headline, lines = [], level = 'muted' }) => {
  setDiagnosticsScope('component', { headline, lines, level })
}

const setTypecheckButtonLoading = isLoading => {
  if (!typecheckButton) {
    return
  }

  typecheckButton.classList.toggle('render-button--loading', isLoading)
  typecheckButton.setAttribute('aria-busy', isLoading ? 'true' : 'false')
  typecheckButton.disabled = isLoading
}

const clearTypeRecheckTimer = () => {
  if (!scheduledTypeRecheck) {
    return
  }

  clearTimeout(scheduledTypeRecheck)
  scheduledTypeRecheck = null
}

const scheduleTypeRecheck = () => {
  clearTypeRecheckTimer()

  if (!hasUnresolvedTypeErrors) {
    return
  }

  scheduledTypeRecheck = setTimeout(() => {
    scheduledTypeRecheck = null
    typeCheckRunId += 1
    void runTypeDiagnostics(typeCheckRunId)
  }, 450)
}

const setRenderedStatus = () => {
  if (lastTypeErrorCount > 0) {
    setStatus(`Rendered (Type errors: ${lastTypeErrorCount})`)
    return
  }

  if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
    setStatus('Rendered')
  }
}

const flattenTypeDiagnosticMessage = (compiler, messageText) => {
  if (typeof compiler.flattenDiagnosticMessageText === 'function') {
    return compiler.flattenDiagnosticMessageText(messageText, '\n')
  }

  if (typeof messageText === 'string') {
    return messageText
  }

  if (messageText && typeof messageText.messageText === 'string') {
    return messageText.messageText
  }

  return 'Unknown TypeScript diagnostic'
}

const formatTypeDiagnostic = (compiler, diagnostic) => {
  const message = flattenTypeDiagnosticMessage(compiler, diagnostic.messageText)

  if (!diagnostic.file || typeof diagnostic.start !== 'number') {
    return `TS${diagnostic.code}: ${message}`
  }

  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
  return `L${position.line + 1}:${position.character + 1} TS${diagnostic.code}: ${message}`
}

const ensureTypeScriptCompiler = async () => {
  if (typeScriptCompiler) {
    return typeScriptCompiler
  }

  try {
    const loaded = await importFromCdnWithFallback(cdnImports.typescript)
    typeScriptCompiler = loaded.module.default ?? loaded.module

    if (typeof typeScriptCompiler.transpileModule !== 'function') {
      throw new Error(`transpileModule export was not found from ${loaded.url}`)
    }

    return typeScriptCompiler
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown TypeScript module loading failure'
    throw new Error(
      `Unable to load TypeScript diagnostics runtime from CDN: ${message}`,
      {
        cause: error,
      },
    )
  }
}

const shouldIgnoreTypeDiagnostic = diagnostic => {
  const ignoredCodes = new Set([2318, 6053])
  return ignoredCodes.has(diagnostic.code)
}

const normalizeVirtualFileName = fileName =>
  typeof fileName === 'string' && fileName.startsWith('/') ? fileName.slice(1) : fileName

const fetchTypeScriptLibText = async fileName => {
  const attempts = getTypeScriptLibUrls(fileName).map(async url => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`)
    }

    return response.text()
  })

  try {
    return await Promise.any(attempts)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to fetch TypeScript lib file ${fileName}: ${message}`, {
      cause: error,
    })
  }
}

const parseTypeScriptLibReferences = sourceText => {
  const references = new Set()
  const libReferencePattern = /\/\/\/\s*<reference\s+lib="([^"]+)"\s*\/>/g
  const pathReferencePattern = /\/\/\/\s*<reference\s+path="([^"]+)"\s*\/>/g

  for (const match of sourceText.matchAll(libReferencePattern)) {
    const libName = match[1]?.trim()
    if (libName) {
      references.add(`lib.${libName}.d.ts`)
    }
  }

  for (const match of sourceText.matchAll(pathReferencePattern)) {
    const pathName = match[1]?.trim()
    if (pathName) {
      references.add(pathName.replace(/^\.\//, ''))
    }
  }

  return [...references]
}

const hydrateTypeScriptLibFiles = async (pendingFileNames, loaded) => {
  const batch = [...new Set(pendingFileNames.map(normalizeVirtualFileName))].filter(
    fileName =>
      typeof fileName === 'string' && fileName.length > 0 && !loaded.has(fileName),
  )

  if (batch.length === 0) {
    return
  }

  const discoveredReferences = await Promise.all(
    batch.map(async fileName => {
      const sourceText = await fetchTypeScriptLibText(fileName)
      loaded.set(fileName, sourceText)
      return parseTypeScriptLibReferences(sourceText).map(normalizeVirtualFileName)
    }),
  )

  await hydrateTypeScriptLibFiles(discoveredReferences.flat(), loaded)
}

const ensureTypeScriptLibFiles = async () => {
  if (typeScriptLibFiles) {
    return typeScriptLibFiles
  }

  const loaded = new Map()
  await hydrateTypeScriptLibFiles([defaultTypeScriptLibFileName], loaded)
  typeScriptLibFiles = loaded
  return typeScriptLibFiles
}

const collectTypeDiagnostics = async (compiler, sourceText) => {
  const sourceFileName = 'component.tsx'
  const jsxTypesFileName = 'knighted-jsx-runtime.d.ts'
  const libFiles = await ensureTypeScriptLibFiles()
  const jsxTypes =
    'declare namespace React {\n' +
    '  type Key = string | number\n' +
    '  interface Attributes { key?: Key | null }\n' +
    '}\n' +
    'declare namespace JSX {\n' +
    '  type Element = unknown\n' +
    '  interface ElementChildrenAttribute { children: unknown }\n' +
    '  interface IntrinsicAttributes extends React.Attributes {}\n' +
    '  interface IntrinsicElements { [elemName: string]: Record<string, unknown> }\n' +
    '}\n'

  const files = new Map([
    [sourceFileName, sourceText],
    [jsxTypesFileName, jsxTypes],
    ...libFiles.entries(),
  ])

  const options = {
    jsx: compiler.JsxEmit?.Preserve,
    target: compiler.ScriptTarget?.ES2022,
    module: compiler.ModuleKind?.ESNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  }

  const host = {
    fileExists: fileName => files.has(normalizeVirtualFileName(fileName)),
    readFile: fileName => files.get(normalizeVirtualFileName(fileName)),
    getSourceFile: (fileName, languageVersion) => {
      const normalizedFileName = normalizeVirtualFileName(fileName)
      const text = files.get(normalizedFileName)
      if (typeof text !== 'string') {
        return undefined
      }

      const scriptKind = normalizedFileName.endsWith('.tsx')
        ? compiler.ScriptKind?.TSX
        : normalizedFileName.endsWith('.d.ts')
          ? compiler.ScriptKind?.TS
          : compiler.ScriptKind?.TS

      return compiler.createSourceFile(
        normalizedFileName,
        text,
        languageVersion,
        true,
        scriptKind,
      )
    },
    getDefaultLibFileName: () => defaultTypeScriptLibFileName,
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getDirectories: () => [],
    getCanonicalFileName: fileName => normalizeVirtualFileName(fileName),
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  }

  const program = compiler.createProgram({
    rootNames: [sourceFileName, jsxTypesFileName],
    options,
    host,
  })

  return compiler
    .getPreEmitDiagnostics(program)
    .filter(diagnostic => !shouldIgnoreTypeDiagnostic(diagnostic))
}

const runTypeDiagnostics = async runId => {
  activeTypeDiagnosticsRuns += 1
  setTypecheckButtonLoading(true)

  setTypeDiagnosticsDetails({
    headline: 'Type checking…',
    level: 'muted',
  })

  try {
    const compiler = await ensureTypeScriptCompiler()
    if (runId !== typeCheckRunId) {
      return
    }

    const diagnostics = await collectTypeDiagnostics(compiler, getJsxSource())
    const errorCategory = compiler.DiagnosticCategory?.Error
    const errors = diagnostics.filter(diagnostic => diagnostic.category === errorCategory)
    lastTypeErrorCount = errors.length
    hasUnresolvedTypeErrors = errors.length > 0
    clearTypeRecheckTimer()

    if (errors.length === 0) {
      setTypeDiagnosticsDetails({
        headline: 'No TypeScript errors found.',
        level: 'ok',
      })
    } else {
      setTypeDiagnosticsDetails({
        headline: `TypeScript found ${errors.length} error${errors.length === 1 ? '' : 's'}:`,
        lines: errors.map(diagnostic => formatTypeDiagnostic(compiler, diagnostic)),
        level: 'error',
      })
    }

    if (
      statusNode.textContent === 'Rendered' ||
      statusNode.textContent.startsWith('Rendered (Type errors:')
    ) {
      setRenderedStatus()
    }
  } catch (error) {
    if (runId !== typeCheckRunId) {
      return
    }

    lastTypeErrorCount = 0
    hasUnresolvedTypeErrors = false
    clearTypeRecheckTimer()
    const message = error instanceof Error ? error.message : String(error)
    setTypeDiagnosticsDetails({
      headline: `Type diagnostics unavailable: ${message}`,
      level: 'error',
    })

    if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
      setStatus('Rendered')
    }
  } finally {
    activeTypeDiagnosticsRuns = Math.max(0, activeTypeDiagnosticsRuns - 1)
    setTypecheckButtonLoading(activeTypeDiagnosticsRuns > 0)
  }
}

const markTypeDiagnosticsStale = () => {
  if (hasUnresolvedTypeErrors) {
    setTypeDiagnosticsDetails({
      headline: 'Source changed. Re-checking type errors…',
      level: 'muted',
    })
    scheduleTypeRecheck()
    return
  }

  lastTypeErrorCount = 0
  setTypeDiagnosticsDetails({
    headline: 'Source changed. Click Typecheck to run diagnostics.',
    level: 'muted',
  })

  if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
    setStatus('Rendered')
  }
}

const appGridLayouts = ['default', 'preview-right', 'preview-left']

const applyAppGridLayout = (layout, { persist = true } = {}) => {
  if (!appGrid || !appGridLayouts.includes(layout)) {
    return
  }

  appGrid.classList.toggle('app-grid--preview-right', layout === 'preview-right')
  appGrid.classList.toggle('app-grid--preview-left', layout === 'preview-left')

  for (const button of appGridLayoutButtons) {
    const isActive = button.dataset.appGridLayout === layout
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
  }

  if (persist) {
    try {
      localStorage.setItem(appGridLayoutStorageKey, layout)
    } catch {
      /* Ignore storage write errors in restricted browsing modes. */
    }
  }
}

const getInitialAppGridLayout = () => {
  try {
    const value = localStorage.getItem(appGridLayoutStorageKey)
    if (appGridLayouts.includes(value)) {
      return value
    }
  } catch {
    /* Ignore storage read errors in restricted browsing modes. */
  }

  return 'default'
}

const applyTheme = (theme, { persist = true } = {}) => {
  if (!['dark', 'light'].includes(theme)) {
    return
  }

  document.documentElement.dataset.theme = theme
  syncPreviewBackgroundPickerFromTheme()

  for (const button of appThemeButtons) {
    const isActive = button.dataset.appTheme === theme
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
  }

  if (persist) {
    try {
      localStorage.setItem(appThemeStorageKey, theme)
    } catch {
      /* Ignore storage write errors in restricted browsing modes. */
    }
  }
}

const getInitialTheme = () => {
  try {
    const value = localStorage.getItem(appThemeStorageKey)
    if (value === 'dark' || value === 'light') {
      return value
    }
  } catch {
    /* Ignore storage read errors in restricted browsing modes. */
  }

  return 'dark'
}

const setCdnLoading = isLoading => {
  if (!cdnLoading) return
  cdnLoading.hidden = !isLoading
}

const setStyleCompiling = isCompiling => {
  previewHost.dataset.styleCompiling = isCompiling ? 'true' : 'false'
}

const debounceRender = () => {
  if (scheduled) {
    clearTimeout(scheduled)
  }
  scheduled = setTimeout(renderPreview, 200)
}

const setJsxSource = value => {
  if (jsxCodeEditor) {
    suppressEditorChangeSideEffects = true
    try {
      jsxCodeEditor.setValue(value)
    } finally {
      suppressEditorChangeSideEffects = false
    }
  }
  jsxEditor.value = value
}

const setCssSource = value => {
  if (cssCodeEditor) {
    suppressEditorChangeSideEffects = true
    try {
      cssCodeEditor.setValue(value)
    } finally {
      suppressEditorChangeSideEffects = false
    }
  }
  cssEditor.value = value
}

const clearComponentSource = () => {
  setJsxSource('')
  clearDiagnosticsScope('component')
  lastTypeErrorCount = 0
  hasUnresolvedTypeErrors = false
  clearTypeRecheckTimer()
  setStatus('Component cleared')

  if (!jsxCodeEditor) {
    maybeRender()
  }
}

const clearStylesSource = () => {
  setCssSource('')
  clearDiagnosticsScope('styles')
  setStatus('Styles cleared')
  if (!cssCodeEditor) {
    maybeRender()
  }
}

const confirmClearSource = ({ label, onConfirm }) => {
  const supportsModalDialog =
    clearConfirmDialog instanceof HTMLDialogElement &&
    typeof clearConfirmDialog.showModal === 'function'

  if (!supportsModalDialog) {
    if (
      window.confirm(
        `Clear ${label.toLowerCase()} source? This action will remove all text from the editor.`,
      )
    ) {
      onConfirm()
    }
    return
  }

  if (clearConfirmDialog.open) {
    return
  }

  if (clearConfirmTitle) {
    clearConfirmTitle.textContent = `Clear ${label} source?`
  }

  if (clearConfirmCopy) {
    clearConfirmCopy.textContent =
      'This action will remove all text from the editor. This cannot be undone.'
  }

  pendingClearAction = onConfirm
  clearConfirmDialog.showModal()
}

const copyTextToClipboard = async text => {
  if (!clipboardSupported) {
    throw new Error('Clipboard API is not available in this browser context.')
  }

  await navigator.clipboard.writeText(text)
}

const copyComponentSource = async () => {
  try {
    await copyTextToClipboard(getJsxSource())
    setStatus('Component copied')
  } catch {
    setStatus('Copy failed')
  }
}

const copyStylesSource = async () => {
  try {
    await copyTextToClipboard(getCssSource())
    setStatus('Styles copied')
  } catch {
    setStatus('Copy failed')
  }
}

const toHexChannel = value => value.toString(16).padStart(2, '0')

const normalizeColorToHex = colorValue => {
  if (typeof colorValue !== 'string' || colorValue.length === 0) {
    return '#12141c'
  }

  if (/^#[\da-f]{6}$/i.test(colorValue)) {
    return colorValue.toLowerCase()
  }

  if (/^#[\da-f]{3}$/i.test(colorValue)) {
    return colorValue
      .slice(1)
      .split('')
      .map(channel => channel + channel)
      .join('')
      .replace(/^/, '#')
      .toLowerCase()
  }

  const channels = colorValue.match(/\d+/g)
  if (!channels || channels.length < 3) {
    return '#12141c'
  }

  const [red, green, blue] = channels.slice(0, 3).map(value => Number.parseInt(value, 10))
  if ([red, green, blue].some(value => Number.isNaN(value))) {
    return '#12141c'
  }

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`
}

const applyPreviewBackgroundColor = color => {
  if (!previewHost) {
    return
  }

  if (typeof color === 'string' && color.length > 0) {
    previewHost.style.backgroundColor = color
    return
  }

  previewHost.style.removeProperty('background-color')
}

const syncPreviewBackgroundPickerFromTheme = () => {
  if (!previewBgColorInput || !previewHost || previewBackgroundCustomized) {
    return
  }

  previewBackgroundColor = null
  applyPreviewBackgroundColor(null)
  previewBgColorInput.value = normalizeColorToHex(
    getComputedStyle(previewHost).backgroundColor,
  )
}

const initializePreviewBackgroundPicker = () => {
  if (!previewBgColorInput || !previewHost) {
    return
  }

  const initialColor = normalizeColorToHex(getComputedStyle(previewHost).backgroundColor)
  previewBackgroundColor = null
  previewBackgroundCustomized = false
  previewBgColorInput.value = initialColor
  applyPreviewBackgroundColor(null)

  previewBgColorInput.addEventListener('input', () => {
    previewBackgroundColor = previewBgColorInput.value
    previewBackgroundCustomized = true
    applyPreviewBackgroundColor(previewBackgroundColor)
  })
}

const recreatePreviewHost = () => {
  const nextHost = document.createElement('div')
  nextHost.id = 'preview-host'
  nextHost.className = previewHost.className
  previewHost.replaceWith(nextHost)
  previewHost = nextHost

  applyPreviewBackgroundColor(previewBackgroundColor)
}

const getRenderTarget = () => {
  if (!shadowToggle.checked && previewHost.shadowRoot) {
    /* ShadowRoot cannot be detached, so recreate the host for light DOM mode. */
    if (reactRoot) {
      reactRoot.unmount()
      reactRoot = null
    }
    recreatePreviewHost()
  }

  if (shadowToggle.checked) {
    if (!previewHost.shadowRoot) {
      previewHost.attachShadow({ mode: 'open' })
    }
    return previewHost.shadowRoot
  }
  return previewHost
}

const clearTarget = target => {
  if (!target) return
  if (reactRoot) {
    reactRoot.unmount()
    reactRoot = null
  }
  target.innerHTML = ''
}

const updateStyleWarning = () => {
  const mode = styleMode.value
  if (mode === 'css') {
    styleWarning.textContent = ''
    return
  }
  if (mode === 'module') {
    styleWarning.textContent =
      'CSS Modules are compiled in-browser and class names are remapped automatically.'
    return
  }

  styleWarning.textContent = `${styleLabels[mode]} is compiled in-browser via @knighted/css/browser.`
}

const shadowPreviewBaseStyles = `
:host {
  all: initial;
  display: var(--preview-host-display, block);
  flex: var(--preview-host-flex, 1 1 auto);
  min-height: var(--preview-host-min-height, 180px);
  padding: var(--preview-host-padding, 18px);
  overflow: var(--preview-host-overflow, auto);
  position: var(--preview-host-position, relative);
  background: var(--surface-preview);
  color-scheme: var(--control-color-scheme, dark);
  z-index: var(--preview-host-z-index, 1);
  box-sizing: border-box;
}
`

const applyStyles = (target, cssText) => {
  if (!target) return

  const styleTag = document.createElement('style')
  const isShadowTarget = target instanceof ShadowRoot
  styleTag.textContent = isShadowTarget
    ? `${shadowPreviewBaseStyles}\n${cssText}`
    : `@scope (#preview-host) {\n${cssText}\n}`
  target.append(styleTag)
}

const normalizeCssModuleExport = value => {
  if (Array.isArray(value)) {
    return value.join(' ')
  }
  if (value && typeof value === 'object') {
    const entry = value
    const composed = Array.isArray(entry.composes)
      ? entry.composes
      : Array.isArray(entry.composes?.names)
        ? entry.composes.names
        : []

    const names = [entry.name, ...composed.map(item => item?.name ?? item)].filter(
      name => typeof name === 'string' && name.length > 0,
    )

    if (names.length > 0) {
      return names.join(' ')
    }
  }
  return typeof value === 'string' ? value : ''
}

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const appendCssModuleLocalAliases = (cssText, moduleExports) => {
  if (!cssText || !moduleExports) {
    return cssText
  }

  let output = cssText

  for (const [localClassName, exportedValue] of Object.entries(moduleExports)) {
    if (typeof localClassName !== 'string' || !localClassName) {
      continue
    }

    const hashedTokens = normalizeCssModuleExport(exportedValue)
      .split(/\s+/)
      .filter(Boolean)

    for (const hashedClassName of hashedTokens) {
      if (hashedClassName === localClassName) {
        continue
      }
      const rx = new RegExp(`\\.${escapeRegex(hashedClassName)}(?![\\w-])`, 'g')
      output = output.replace(rx, `.${hashedClassName}, .${localClassName}`)
    }
  }

  return output
}

const remapClassTokens = (className, moduleExports) => {
  if (!className || !moduleExports) return className
  return className
    .split(/\s+/)
    .filter(Boolean)
    .map(token => {
      const mapped = normalizeCssModuleExport(moduleExports[token])
      return mapped || token
    })
    .join(' ')
}

const remapDomClassNames = (target, moduleExports) => {
  if (!target || !moduleExports) return
  const elements = [target, ...(target.querySelectorAll?.('*') ?? [])]
  for (const node of elements) {
    if (!(node instanceof Element)) continue
    const className = node.getAttribute('class')
    if (!className) continue
    const remapped = remapClassTokens(className, moduleExports)
    if (remapped !== className) {
      node.setAttribute('class', remapped)
    }
  }
}

const remapReactClassNames = (value, moduleExports, React) => {
  if (!moduleExports || !React.isValidElement(value)) {
    return value
  }

  const nextProps = {}
  let hasChanges = false

  if (typeof value.props.className === 'string') {
    const remappedClassName = remapClassTokens(value.props.className, moduleExports)
    if (remappedClassName !== value.props.className) {
      nextProps.className = remappedClassName
      hasChanges = true
    }
  }

  if (Object.prototype.hasOwnProperty.call(value.props, 'children')) {
    const remappedChildren = React.Children.map(value.props.children, child =>
      remapReactClassNames(child, moduleExports, React),
    )
    if (remappedChildren !== value.props.children) {
      nextProps.children = remappedChildren
      hasChanges = true
    }
  }

  if (!hasChanges) {
    return value
  }

  return React.cloneElement(value, nextProps)
}

const shouldAttemptTranspileFallback = error => error instanceof SyntaxError

const createUserModuleFactory = source =>
  new Function(
    'jsx',
    'reactJsx',
    'React',
    `"use strict";\nlet __defaultExport;\n${source}\nconst __renderComponent = (Component, jsxTag) => {\n  if (typeof Component !== 'function') return null;\n  return jsxTag\`<\${Component} />\`;\n};\nconst __renderEntry = jsxTag => {\n  if (typeof render === 'function') return render(jsxTag);\n  if (typeof __defaultExport !== 'undefined') {\n    return typeof __defaultExport === 'function'\n      ? __renderComponent(__defaultExport, jsxTag)\n      : __defaultExport;\n  }\n  const component = typeof App === 'function' ? App : typeof View === 'function' ? View : null;\n  if (component) return __renderComponent(component, jsxTag);\n  if (typeof View !== 'undefined') return View;\n  if (typeof view !== 'undefined') return view;\n  if (typeof output !== 'undefined') return output;\n  return null;\n};\nreturn __renderEntry;`,
  )

const isDomNode = value => typeof Node !== 'undefined' && value instanceof Node

const isReactElementLike = value =>
  Boolean(value && typeof value === 'object' && '$$typeof' in value)

const isSassCompiler = candidate =>
  Boolean(
    candidate &&
    (typeof candidate.compileStringAsync === 'function' ||
      typeof candidate.compileString === 'function' ||
      typeof candidate.compile === 'function'),
  )

const loadSassCompilerFrom = async (module, url) => {
  const candidates = [module.default, module, module.Sass, module.default?.Sass].filter(
    Boolean,
  )

  for (const candidate of candidates) {
    if (isSassCompiler(candidate)) {
      return candidate
    }
  }

  throw new Error(`No Sass compiler API found from ${url}`)
}

const ensureSassCompiler = async () => {
  if (sassCompiler) return sassCompiler

  try {
    const loaded = await importFromCdnWithFallback(cdnImports.sass)
    sassCompiler = await loadSassCompilerFrom(loaded.module, loaded.url)
    return sassCompiler
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Sass module loading failure'
    throw new Error(`Unable to load Sass compiler for browser usage: ${message}`, {
      cause: error,
    })
  }
}

const ensureLessCompiler = async () => {
  if (lessCompiler) return lessCompiler
  try {
    const loaded = await importFromCdnWithFallback(cdnImports.less)
    lessCompiler = loaded.module.default ?? loaded.module
    return lessCompiler
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Less module loading failure'
    throw new Error(`Unable to load Less compiler for browser usage: ${message}`, {
      cause: error,
    })
  }
}

const resolveLightningTransform = module => {
  const candidates = [module, module.default].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate && typeof candidate.transform === 'function') {
      return candidate.transform.bind(candidate)
    }
  }

  return null
}

const tryLoadLightningCssWasm = async ({ module, url }) => {
  const hasNamedInit = typeof module.init === 'function'
  const hasNamedTransform = typeof module.transform === 'function'

  if (hasNamedInit) {
    await module.init()
  } else if (hasNamedTransform && typeof module.default === 'function') {
    // @parcel/css-wasm exports default init + named transform.
    await module.default()
  }

  const transform = resolveLightningTransform(module)
  if (!transform) {
    throw new Error(`No transform() export available from ${url}`)
  }

  return { transform }
}

const ensureLightningCssWasm = async () => {
  if (lightningCssWasm) return lightningCssWasm

  try {
    const loaded = await importFromCdnWithFallback(cdnImports.lightningCssWasm)
    lightningCssWasm = await tryLoadLightningCssWasm(loaded)
    return lightningCssWasm
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Unable to load Lightning CSS WASM: ${error.message}`, {
        cause: error,
      })
    }

    throw new Error(
      'Unable to load Lightning CSS WASM: Unknown module loading failure.',
      {
        cause: error,
      },
    )
  }
}

const compileStyles = async () => {
  const { cssFromSource } = await ensureCoreRuntime()
  const dialect = styleMode.value
  const cssSource = getCssSource()
  const cacheKey = `${dialect}\u0000${cssSource}`
  if (compiledStylesCache.key === cacheKey && compiledStylesCache.value) {
    return compiledStylesCache.value
  }

  const shouldShowSpinner = dialect !== 'css'
  setStyleCompiling(shouldShowSpinner)

  if (!shouldShowSpinner) {
    const output = { css: cssSource, moduleExports: null }
    compiledStylesCache = {
      key: cacheKey,
      value: output,
    }
    return output
  }

  try {
    const options = {
      dialect,
      filename:
        dialect === 'less'
          ? 'playground.less'
          : dialect === 'sass'
            ? 'playground.scss'
            : 'playground.module.css',
    }

    if (dialect === 'sass') {
      options.sass = await ensureSassCompiler()
    } else if (dialect === 'less') {
      options.less = await ensureLessCompiler()
    } else if (dialect === 'module') {
      options.lightningcss = await ensureLightningCssWasm()
    }

    const result = await cssFromSource(cssSource, options)
    if (!result.ok) {
      throw new Error(result.error.message)
    }

    const moduleExports = result.exports ?? null
    const compiledCss =
      dialect === 'module'
        ? appendCssModuleLocalAliases(result.css, moduleExports)
        : result.css

    const output = {
      css: compiledCss,
      moduleExports,
    }
    compiledStylesCache = {
      key: cacheKey,
      value: output,
    }
    return output
  } finally {
    setStyleCompiling(false)
  }
}

const evaluateUserModule = async (helpers = {}) => {
  const { jsx, transpileJsxSource } = await ensureCoreRuntime()
  const userCode = getJsxSource()
    .replace(/^\s*export\s+default\s+function\b/gm, '__defaultExport = function')
    .replace(/^\s*export\s+default\s+class\b/gm, '__defaultExport = class')
    .replace(/^\s*export\s+default\s+/gm, '__defaultExport = ')
    .replace(/^\s*export\s+(?=function|const|let|var|class)/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  try {
    const moduleFactory = createUserModuleFactory(userCode)
    return moduleFactory(helpers.jsx ?? jsx, helpers.reactJsx, helpers.React)
  } catch (error) {
    if (!shouldAttemptTranspileFallback(error)) {
      throw error
    }

    const transpileMode = helpers.React && helpers.reactJsx ? 'react' : 'dom'
    const transpileOptionsByMode = {
      dom: {
        sourceType: 'script',
        createElement: 'jsx.createElement',
        fragment: 'jsx.Fragment',
        typescript: 'strip',
      },
      react: {
        sourceType: 'script',
        createElement: 'React.createElement',
        fragment: 'React.Fragment',
        typescript: 'strip',
      },
    }
    const transpiledUserCode = transpileJsxSource(
      userCode,
      transpileOptionsByMode[transpileMode],
    ).code
    const moduleFactory = createUserModuleFactory(transpiledUserCode)

    if (helpers.React && helpers.reactJsx) {
      return moduleFactory(helpers.jsx ?? jsx, helpers.reactJsx, helpers.React)
    }

    if (transpileMode === 'dom') {
      return moduleFactory(helpers.jsx ?? jsx, helpers.reactJsx, helpers.React)
    }

    const { React, reactJsx } = await ensureReactRuntime()
    return moduleFactory(helpers.jsx ?? jsx, helpers.reactJsx ?? reactJsx, React)
  }
}

const ensureReactRuntime = async () => {
  if (reactRuntime) return reactRuntime

  try {
    const [jsxReact, react, reactDomClient] = await Promise.all([
      importFromCdnWithFallback(cdnImports.jsxReact),
      importFromCdnWithFallback(cdnImports.react),
      importFromCdnWithFallback(cdnImports.reactDomClient),
    ])

    const reactJsx = jsxReact.module.reactJsx
    const React = react.module.default ?? react.module
    const createRoot = reactDomClient.module.createRoot

    if (typeof reactJsx !== 'function') {
      throw new Error(`reactJsx export was not found from ${jsxReact.url}`)
    }
    if (!React || typeof React.isValidElement !== 'function') {
      throw new Error(`React runtime export was not found from ${react.url}`)
    }
    if (typeof createRoot !== 'function') {
      throw new Error(`createRoot export was not found from ${reactDomClient.url}`)
    }

    reactRuntime = { reactJsx, React, createRoot }
    return reactRuntime
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown React module loading failure'
    throw new Error(`Unable to load React runtime from CDN: ${message}`, {
      cause: error,
    })
  }
}

const renderDom = async () => {
  const { jsx } = await ensureCoreRuntime()
  const target = getRenderTarget()
  clearTarget(target)
  const compiledStyles = await compileStyles()
  applyStyles(target, compiledStyles.css)

  const renderFn = await evaluateUserModule()
  const output = renderFn ? renderFn(jsx) : null
  if (isDomNode(output)) {
    target.append(output)
    remapDomClassNames(target, compiledStyles.moduleExports)
  } else if (isReactElementLike(output)) {
    const { createRoot, React } = await ensureReactRuntime()
    const host = document.createElement('div')
    target.append(host)
    reactRoot = createRoot(host)
    reactRoot.render(remapReactClassNames(output, compiledStyles.moduleExports, React))
  } else {
    throw new Error('Expected a render() function or a component named App/View.')
  }
}

const renderReact = async () => {
  const target = getRenderTarget()
  clearTarget(target)
  const compiledStyles = await compileStyles()
  applyStyles(target, compiledStyles.css)

  const { reactJsx, createRoot, React } = await ensureReactRuntime()
  const renderFn = await evaluateUserModule({ jsx: reactJsx, reactJsx, React })
  if (!renderFn) {
    throw new Error('Expected a render() function or a component named App/View.')
  }

  const host = document.createElement('div')
  target.append(host)
  reactRoot = createRoot(host)
  const output = remapReactClassNames(
    renderFn(reactJsx),
    compiledStyles.moduleExports,
    React,
  )
  if (!output) {
    throw new Error('Expected a render() function or a component named App/View.')
  }
  reactRoot.render(output)
}

const renderPreview = async () => {
  scheduled = null
  updateStyleWarning()
  setStatus(hasCompletedInitialRender ? 'Rendering…' : 'Loading CDN assets…')

  try {
    if (renderMode.value === 'react') {
      await renderReact()
    } else {
      await renderDom()
    }
    setStatus('Rendered')
    setRenderedStatus()
  } catch (error) {
    setStatus('Error')
    const target = getRenderTarget()
    clearTarget(target)
    const message = document.createElement('pre')
    message.textContent = error instanceof Error ? error.message : String(error)
    message.style.color = '#ff9aa2'
    target.append(message)
  } finally {
    if (!hasCompletedInitialRender) {
      hasCompletedInitialRender = true
      setCdnLoading(false)
    }
  }
}

const maybeRender = () => {
  if (autoRenderToggle.checked) {
    debounceRender()
  }
}

const updateRenderButtonVisibility = () => {
  renderButton.hidden = autoRenderToggle.checked
}

renderMode.addEventListener('change', maybeRender)
styleMode.addEventListener('change', () => {
  if (cssCodeEditor) {
    cssCodeEditor.setLanguage(getStyleEditorLanguage(styleMode.value))
  }
  maybeRender()
})
shadowToggle.addEventListener('change', maybeRender)
autoRenderToggle.addEventListener('change', () => {
  updateRenderButtonVisibility()
  if (autoRenderToggle.checked) {
    renderPreview()
  }
})
if (diagnosticsToggle) {
  diagnosticsToggle.addEventListener('click', () => {
    setDiagnosticsDrawerOpen(!diagnosticsDrawerOpen)
  })
}
if (diagnosticsClose) {
  diagnosticsClose.addEventListener('click', () => {
    setDiagnosticsDrawerOpen(false)
  })
}
if (diagnosticsClearComponent) {
  diagnosticsClearComponent.addEventListener('click', () => {
    clearDiagnosticsScope('component')
    lastTypeErrorCount = 0
    hasUnresolvedTypeErrors = false
    clearTypeRecheckTimer()
    if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
      setStatus('Rendered')
    }
  })
}
if (diagnosticsClearAll) {
  diagnosticsClearAll.addEventListener('click', () => {
    clearAllDiagnostics()
    lastTypeErrorCount = 0
    hasUnresolvedTypeErrors = false
    clearTypeRecheckTimer()
    if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
      setStatus('Rendered')
    }
  })
}
if (typecheckButton) {
  typecheckButton.addEventListener('click', () => {
    typeCheckRunId += 1
    void runTypeDiagnostics(typeCheckRunId)
  })
}
renderButton.addEventListener('click', renderPreview)
if (clipboardSupported) {
  copyComponentButton.addEventListener('click', () => {
    void copyComponentSource()
  })
  copyStylesButton.addEventListener('click', () => {
    void copyStylesSource()
  })
} else {
  copyComponentButton.hidden = true
  copyStylesButton.hidden = true
}
if (clearConfirmDialog instanceof HTMLDialogElement) {
  clearConfirmDialog.addEventListener('close', () => {
    if (clearConfirmDialog.returnValue === 'confirm') {
      pendingClearAction?.()
    }
    pendingClearAction = null
  })
}

clearComponentButton.addEventListener('click', () => {
  confirmClearSource({
    label: 'Component',
    onConfirm: clearComponentSource,
  })
})

clearStylesButton.addEventListener('click', () => {
  confirmClearSource({
    label: 'Styles',
    onConfirm: clearStylesSource,
  })
})
jsxEditor.addEventListener('input', maybeRender)
jsxEditor.addEventListener('input', markTypeDiagnosticsStale)
cssEditor.addEventListener('input', maybeRender)

for (const button of appGridLayoutButtons) {
  button.addEventListener('click', () => {
    const nextLayout = button.dataset.appGridLayout
    if (!nextLayout) {
      return
    }
    applyAppGridLayout(nextLayout)
  })
}

for (const button of appThemeButtons) {
  button.addEventListener('click', () => {
    const nextTheme = button.dataset.appTheme
    if (!nextTheme) {
      return
    }
    applyTheme(nextTheme)
  })
}

applyAppGridLayout(getInitialAppGridLayout(), { persist: false })
applyTheme(getInitialTheme(), { persist: false })

updateRenderButtonVisibility()
renderDiagnosticsScope('component')
renderDiagnosticsScope('styles')
updateDiagnosticsToggleLabel()
updateUiIssueIndicators()
setDiagnosticsDrawerOpen(false)
setTypeDiagnosticsDetails({ headline: '' })
setStyleCompiling(false)
setCdnLoading(true)
initializePreviewBackgroundPicker()
void initializeCodeEditors()
renderPreview()
