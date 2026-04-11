import {
  collectTopLevelTransformMetadata,
  getFunctionLikeDeclarationNames,
  hasFunctionLikeDeclarationNamed,
} from './jsx-top-level-declarations.js'
import { canRenderPreview, resolvePreviewEntryTab } from './preview-entry-resolver.js'
import { executeWorkspaceIframePreview } from './preview-runtime/iframe-preview-executor.js'
import { planWorkspaceVirtualModules } from './preview-runtime/virtual-workspace-modules.js'
import { createPreviewWorkspaceGraphCache } from './preview-workspace-graph.js'
import { ensureJsxTransformSource } from './jsx-transform-runtime.js'
import { getCdnImportUrl } from './cdn.js'

export const createRenderRuntimeController = ({
  cdnImports,
  importFromCdnWithFallback,
  renderMode,
  styleMode,
  isAutoRenderEnabled = () => false,
  getCssSource,
  getJsxSource,
  getWorkspaceTabs,
  getPreviewHost,
  getPreviewBackgroundColor = () => '',
  clearStyleDiagnostics,
  setStyleDiagnosticsDetails,
  setStatus,
  setRenderedStatus,
  onFirstRenderComplete,
  setCdnLoading,
}) => {
  let scheduled = null
  let renderInFlight = false
  let rerenderRequested = false
  let reactRoot = null
  let sassCompiler = null
  let lessCompiler = null
  let lightningCssWasm = null
  let coreRuntime = null
  let compiledStylesCache = {
    key: null,
    value: null,
  }
  let disposeWorkspaceVirtualModules = null
  let disposeIframeRuntimeBridge = null
  let lastRenderedEntryTabId = ''
  let lastRenderedDependencyTabIds = new Set()
  let topLevelTransformMetadataCache = {
    source: null,
    transformJsxSource: null,
    value: null,
  }
  let hasCompletedInitialRender = false
  const workspaceGraphCache = createPreviewWorkspaceGraphCache()

  const setStyleCompiling = isCompiling => {
    const previewHost = getPreviewHost()
    if (!previewHost) {
      return
    }

    previewHost.dataset.styleCompiling = isCompiling ? 'true' : 'false'
  }

  const ensureCoreRuntime = async () => {
    if (coreRuntime) return coreRuntime

    try {
      const [cssBrowser, jsxDom, transformJsxSource] = await Promise.all([
        importFromCdnWithFallback(cdnImports.cssBrowser),
        importFromCdnWithFallback(cdnImports.jsxDom),
        ensureJsxTransformSource({
          cdnImports,
          importFromCdnWithFallback,
        }),
      ])

      if (typeof cssBrowser.module.cssFromSource !== 'function') {
        throw new Error(`cssFromSource export was not found from ${cssBrowser.url}`)
      }

      if (typeof jsxDom.module.jsx !== 'function') {
        throw new Error(`jsx export was not found from ${jsxDom.url}`)
      }

      coreRuntime = {
        cssFromSource: cssBrowser.module.cssFromSource,
        jsx: jsxDom.module.jsx,
        transformJsxSource,
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

  const getRenderTarget = () => {
    return getPreviewHost()
  }

  const clearTarget = target => {
    if (!target) return
    if (reactRoot) {
      reactRoot.unmount()
      reactRoot = null
    }
    target.innerHTML = ''
  }

  const applyStyles = (target, cssText) => {
    if (!target) return

    const styleTag = document.createElement('style')
    styleTag.textContent = `@scope (#preview-host) {\n${cssText}\n}`
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

  const formatTransformDiagnosticsError = diagnostics => {
    const firstDiagnostic = diagnostics?.[0]

    if (!firstDiagnostic) {
      return '[jsx] Failed to transform source.'
    }

    const lines = [`[jsx] ${firstDiagnostic.message}`]

    if (firstDiagnostic.codeframe) {
      lines.push(firstDiagnostic.codeframe)
    }

    if (firstDiagnostic.helpMessage) {
      lines.push(firstDiagnostic.helpMessage)
    }

    return lines.join('\n')
  }

  const hasAppDeclaration = declarations =>
    hasFunctionLikeDeclarationNamed({ declarations, name: 'App' })

  const isComponentLikeName = name => typeof name === 'string' && /^[A-Z]/.test(name)

  const getComponentNames = declarations =>
    getFunctionLikeDeclarationNames({ declarations, excludeNames: ['App'] }).filter(
      isComponentLikeName,
    )

  const isSourceRange = range =>
    Array.isArray(range) &&
    range.length === 2 &&
    Number.isInteger(range[0]) &&
    Number.isInteger(range[1])

  const sourceFromRange = ({ source, range }) => {
    if (!isSourceRange(range)) {
      return null
    }

    const [start, end] = range
    if (start < 0 || end < start || end > source.length) {
      return null
    }

    const expression = source.slice(start, end).trim()
    return expression || null
  }

  const getTopLevelTransformMetadata = ({ source, transformJsxSource }) => {
    if (
      topLevelTransformMetadataCache.source === source &&
      topLevelTransformMetadataCache.transformJsxSource === transformJsxSource &&
      topLevelTransformMetadataCache.value
    ) {
      return topLevelTransformMetadataCache.value
    }

    const value = collectTopLevelTransformMetadata({ source, transformJsxSource })
    topLevelTransformMetadataCache = {
      source,
      transformJsxSource,
      value,
    }

    return value
  }

  const withImplicitAppWrapper = (source, transformJsxSource) => {
    if (!source.trim()) {
      return source
    }

    if (/^\s*export\s+default\b/m.test(source)) {
      return source
    }

    const {
      declarations,
      importCount,
      hasTopLevelJsxExpression,
      topLevelJsxExpressionRange,
    } = getTopLevelTransformMetadata({ source, transformJsxSource })
    if (hasAppDeclaration(declarations)) {
      return source
    }

    if (hasTopLevelJsxExpression) {
      const expressionSource = sourceFromRange({
        source,
        range: topLevelJsxExpressionRange,
      })

      if (!expressionSource) {
        throw new Error(
          'Unable to infer top-level JSX entry for implicit App. Define App explicitly.',
        )
      }

      if (declarations.length > 0 || importCount > 0) {
        throw new Error(
          'Top-level JSX with declarations or imports requires an explicit App component.',
        )
      }

      return `const App = () => (${expressionSource})`
    }

    const componentNames = getComponentNames(declarations)
    if (componentNames.length > 0) {
      const children = componentNames.map(name => `    <${name} />`).join('\n')
      return `${source}\n\nconst App = () => (\n  <>\n${children}\n  </>\n)`
    }

    return source
  }

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
      clearStyleDiagnostics()
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
      clearStyleDiagnostics()
      compiledStylesCache = {
        key: cacheKey,
        value: output,
      }
      return output
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const lines = message
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.trim().length > 0)

      setStyleDiagnosticsDetails({
        headline: 'Style compilation failed.',
        lines,
        level: 'error',
      })
      throw error
    } finally {
      setStyleCompiling(false)
    }
  }

  const hasComponentSource = () => {
    const tabs = typeof getWorkspaceTabs === 'function' ? getWorkspaceTabs() : undefined

    return canRenderPreview({
      tabs,
      fallbackSource: getJsxSource(),
    })
  }

  const disposeWorkspaceModules = () => {
    if (typeof disposeWorkspaceVirtualModules !== 'function') {
      return
    }

    disposeWorkspaceVirtualModules()
    disposeWorkspaceVirtualModules = null
  }

  const disposeIframeBridge = () => {
    if (typeof disposeIframeRuntimeBridge !== 'function') {
      return
    }

    disposeIframeRuntimeBridge()
    disposeIframeRuntimeBridge = null
  }

  const renderPreviewError = error => {
    disposeWorkspaceModules()
    disposeIframeBridge()
    setStatus('Error', 'error')

    const target = getRenderTarget()
    clearTarget(target)
    const message = document.createElement('pre')
    message.className = 'preview-runtime-error'
    message.textContent = error instanceof Error ? error.message : String(error)
    target.append(message)
  }

  const getRuntimeSpecifier = importKey => {
    const importCandidates = cdnImports?.[importKey]

    if (!Array.isArray(importCandidates) || importCandidates.length === 0) {
      throw new Error(`Unknown CDN import key: ${String(importKey)}`)
    }

    return getCdnImportUrl(importCandidates[0])
  }

  const getWorkspaceRuntimeSpecifiers = () => ({
    jsxDom: getRuntimeSpecifier('jsxDom'),
    jsxReact: getRuntimeSpecifier('jsxReact'),
    react: getRuntimeSpecifier('react'),
    reactDomClient: getRuntimeSpecifier('reactDomClient'),
  })

  const withPreparedEntrySource = ({ tabs, entryTab, transformJsxSource }) => {
    if (!isAutoRenderEnabled()) {
      return tabs
    }

    const entrySource = typeof entryTab?.content === 'string' ? entryTab.content : ''
    const wrappedEntrySource = withImplicitAppWrapper(entrySource, transformJsxSource)

    if (wrappedEntrySource === entrySource) {
      return tabs
    }

    return tabs.map(tab =>
      tab?.id === entryTab.id
        ? {
            ...tab,
            content: wrappedEntrySource,
          }
        : tab,
    )
  }

  const renderWorkspaceInIframe = async ({ mode, cssText }) => {
    const workspaceTabsSnapshot =
      typeof getWorkspaceTabs === 'function' ? getWorkspaceTabs() : []
    const workspaceTabs =
      Array.isArray(workspaceTabsSnapshot) && workspaceTabsSnapshot.length > 0
        ? workspaceTabsSnapshot
        : [
            {
              id: 'component',
              name: 'App.tsx',
              path: 'src/components/App.tsx',
              language: 'javascript-jsx',
              role: 'entry',
              content: getJsxSource(),
            },
          ]

    const entryTab =
      resolvePreviewEntryTab(workspaceTabs) ??
      workspaceTabs.find(tab => tab?.id === 'component') ??
      workspaceTabs[0]

    if (!entryTab) {
      throw new Error('Unable to resolve workspace preview entry tab.')
    }

    const { transformJsxSource } = await ensureCoreRuntime()
    const tabsForExecution = withPreparedEntrySource({
      tabs: workspaceTabs,
      entryTab,
      transformJsxSource,
    })
    const entryTabForExecution =
      resolvePreviewEntryTab(tabsForExecution) ??
      tabsForExecution.find(tab => tab?.id === entryTab.id) ??
      tabsForExecution[0]

    if (!entryTabForExecution) {
      throw new Error('Unable to resolve prepared workspace preview entry tab.')
    }

    const runtimeSpecifiers = getWorkspaceRuntimeSpecifiers()
    const hostPadding =
      getComputedStyle(getRenderTarget()).getPropertyValue('--preview-host-padding') || ''
    const virtualModulePlan = planWorkspaceVirtualModules({
      tabs: tabsForExecution,
      entryTab: entryTabForExecution,
      transformJsxSource,
      formatTransformDiagnosticsError,
      workspaceGraphCache,
      mode,
      runtimeSpecifiers,
    })

    if (!virtualModulePlan) {
      throw new Error('Unable to construct virtual workspace module plan.')
    }

    lastRenderedEntryTabId =
      typeof virtualModulePlan.entryTabId === 'string' ? virtualModulePlan.entryTabId : ''
    lastRenderedDependencyTabIds = new Set(
      Array.isArray(virtualModulePlan.includedTabIds)
        ? virtualModulePlan.includedTabIds
        : [],
    )

    disposeWorkspaceModules()
    disposeIframeBridge()
    disposeWorkspaceVirtualModules = virtualModulePlan.dispose

    try {
      const execution = await executeWorkspaceIframePreview({
        target: getRenderTarget(),
        mode,
        entrySpecifier: virtualModulePlan.entrySpecifier,
        entryExportName: virtualModulePlan.entryExportName,
        importMap: virtualModulePlan.importMap,
        cssText,
        hostPadding,
        backgroundColor: getPreviewBackgroundColor(),
        runtimeSpecifiers,
        onRuntimeError: error => {
          renderPreviewError(error)
        },
      })

      disposeIframeRuntimeBridge = execution.dispose
    } catch (error) {
      disposeWorkspaceModules()
      disposeIframeBridge()
      throw error
    }
  }

  const clearPreview = () => {
    disposeWorkspaceModules()
    disposeIframeBridge()
    const target = getRenderTarget()
    clearTarget(target)
  }

  const renderDom = async () => {
    const compiledStyles = await compileStyles()

    if (!hasComponentSource()) {
      disposeIframeBridge()
      const target = getRenderTarget()
      clearTarget(target)
      applyStyles(target, compiledStyles.css)
      return
    }

    await renderWorkspaceInIframe({
      mode: 'dom',
      cssText: compiledStyles.css,
    })
  }

  const renderReact = async () => {
    const compiledStyles = await compileStyles()

    if (!hasComponentSource()) {
      disposeIframeBridge()
      const target = getRenderTarget()
      clearTarget(target)
      applyStyles(target, compiledStyles.css)
      return
    }

    await renderWorkspaceInIframe({
      mode: 'react',
      cssText: compiledStyles.css,
    })
  }

  const renderPreview = async () => {
    if (renderInFlight) {
      rerenderRequested = true
      return
    }

    renderInFlight = true

    const runRenderPass = async () => {
      scheduled = null
      setStatus(
        hasCompletedInitialRender ? 'Rendering…' : 'Loading CDN assets…',
        'pending',
      )

      try {
        if (renderMode.value === 'react') {
          await renderReact()
        } else {
          await renderDom()
        }
        setStatus('Rendered', 'neutral')
        setRenderedStatus()
      } catch (error) {
        renderPreviewError(error)
      } finally {
        if (!hasCompletedInitialRender) {
          hasCompletedInitialRender = true
          onFirstRenderComplete()
          setCdnLoading(false)
        }
      }
    }

    try {
      rerenderRequested = true

      while (rerenderRequested) {
        rerenderRequested = false
        // Intentionally sequential to drain queued renders without recursion.
        // eslint-disable-next-line no-await-in-loop
        await runRenderPass()
      }
    } finally {
      renderInFlight = false
    }
  }

  const scheduleRender = () => {
    if (renderInFlight) {
      rerenderRequested = true
      return
    }

    if (scheduled) {
      clearTimeout(scheduled)
    }

    scheduled = setTimeout(() => {
      void renderPreview()
    }, 200)
  }

  const shouldAutoRenderForTabChange = tabId => {
    if (typeof tabId !== 'string' || tabId.length === 0) {
      return true
    }

    if (lastRenderedDependencyTabIds.size === 0) {
      return true
    }

    if (lastRenderedDependencyTabIds.has(tabId)) {
      return true
    }

    const workspaceTabsSnapshot =
      typeof getWorkspaceTabs === 'function' ? getWorkspaceTabs() : []
    const workspaceTabs = Array.isArray(workspaceTabsSnapshot)
      ? workspaceTabsSnapshot
      : []
    const entryTab = resolvePreviewEntryTab(workspaceTabs)

    if (!entryTab || typeof entryTab.id !== 'string') {
      return true
    }

    if (entryTab.id === tabId) {
      return true
    }

    if (lastRenderedEntryTabId && entryTab.id !== lastRenderedEntryTabId) {
      return true
    }

    return false
  }

  return {
    clearPreview,
    renderPreview,
    scheduleRender,
    shouldAutoRenderForTabChange,
    setStyleCompiling,
  }
}
