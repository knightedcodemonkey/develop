import { cdnImports, importFromCdnWithFallback } from './cdn.js'
import { createCodeMirrorEditor } from './editor-codemirror.js'
import { defaultCss, defaultJsx } from './defaults.js'

const statusNode = document.getElementById('status')
const appGrid = document.querySelector('.app-grid')
const appGridLayoutButtons = document.querySelectorAll('[data-app-grid-layout]')
const appThemeButtons = document.querySelectorAll('[data-app-theme]')
const renderMode = document.getElementById('render-mode')
const autoRenderToggle = document.getElementById('auto-render')
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
let compiledStylesCache = {
  key: null,
  value: null,
}
let pendingClearAction = null
let hasCompletedInitialRender = false
let previewBackgroundColor = null
let previewBackgroundCustomized = false
const clipboardSupported = Boolean(navigator.clipboard?.writeText)
const appGridLayoutStorageKey = 'knighted-develop:app-grid-layout'
const appThemeStorageKey = 'knighted-develop:theme'

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
        onChange: maybeRender,
      }),
      createCodeMirrorEditor({
        parent: cssHost,
        value: defaultCss,
        language: getStyleEditorLanguage(styleMode.value),
        onChange: maybeRender,
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

const setStatus = text => {
  statusNode.textContent = text
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
    jsxCodeEditor.setValue(value)
  }
  jsxEditor.value = value
}

const setCssSource = value => {
  if (cssCodeEditor) {
    cssCodeEditor.setValue(value)
  }
  cssEditor.value = value
}

const clearComponentSource = () => {
  setJsxSource('')
  setStatus('Component cleared')
  if (!jsxCodeEditor) {
    maybeRender()
  }
}

const clearStylesSource = () => {
  setCssSource('')
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
setStyleCompiling(false)
setCdnLoading(true)
initializePreviewBackgroundPicker()
void initializeCodeEditors()
renderPreview()
