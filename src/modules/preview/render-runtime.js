import {
  canRenderPreview,
  getReactEntryTabCompatibilityError,
  reactEntryTabCompatibilityErrorName,
  resolvePreviewEntryTab,
} from './preview-entry-resolver.js'
import { createWorkspaceIframePreviewBridge } from '../preview-runtime/iframe-preview-executor.js'
import { planWorkspaceVirtualModules } from '../preview-runtime/virtual-workspace-modules.js'
import { createPreviewWorkspaceGraphCache } from './preview-workspace-graph.js'
import { ensureJsxTransformSource } from './jsx-transform-runtime.js'
import { getCdnImportUrl } from '../cdn.js'

export const createRenderRuntimeController = ({
  cdnImports,
  importFromCdnWithFallback,
  renderMode,
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
  onPreviewTelemetry,
}) => {
  const autoRenderDebounceMs = 140
  const autoRenderTypingBurstDebounceMs = 420
  const autoRenderBurstThresholdMs = 900
  let scheduled = null
  let lastScheduleRequestedAt = 0
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
  let iframeRuntimeBridge = null
  let lastRenderedEntryTabId = ''
  let lastRenderedDependencyTabIds = new Set()
  let hasCompletedInitialRender = false
  const workspaceGraphCache = createPreviewWorkspaceGraphCache()
  const styleTabLanguages = new Set(['css', 'less', 'sass', 'module'])
  const stylePathPattern = /\.(?:css|less|sass|scss)$/i
  const fallbackEntryTab = {
    id: 'component',
    name: 'App.tsx',
    path: 'src/components/App.tsx',
    language: 'javascript-jsx',
    role: 'entry',
  }
  const fallbackStylesTab = {
    id: 'styles',
    name: 'app.css',
    path: 'src/styles/app.css',
    language: 'css',
    role: 'module',
    content: '',
  }

  const isStyleTab = tab => {
    if (!tab || typeof tab !== 'object') {
      return false
    }

    if (
      typeof tab.language === 'string' &&
      styleTabLanguages.has(tab.language.trim().toLowerCase())
    ) {
      return true
    }

    const identity =
      typeof tab.path === 'string' && tab.path.trim().length > 0
        ? tab.path
        : typeof tab.name === 'string'
          ? tab.name
          : ''

    return stylePathPattern.test(identity)
  }

  const toStyleDialectForTab = tab => {
    if (!tab || typeof tab !== 'object') {
      return 'css'
    }

    const language =
      typeof tab.language === 'string' ? tab.language.trim().toLowerCase() : ''

    if (language === 'less') {
      return 'less'
    }

    if (language === 'sass') {
      return 'sass'
    }

    if (language === 'module') {
      return 'module'
    }

    const identity =
      typeof tab.path === 'string' && tab.path.trim().length > 0
        ? tab.path
        : typeof tab.name === 'string'
          ? tab.name
          : ''
    const normalizedIdentity = identity.trim().toLowerCase()

    if (normalizedIdentity.endsWith('.less')) {
      return 'less'
    }

    if (normalizedIdentity.endsWith('.sass') || normalizedIdentity.endsWith('.scss')) {
      return 'sass'
    }

    if (normalizedIdentity.endsWith('.module.css')) {
      return 'module'
    }

    return 'css'
  }

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

  const getWorkspaceTabsForPreview = () => {
    const workspaceTabsSnapshot =
      typeof getWorkspaceTabs === 'function' ? getWorkspaceTabs() : []

    if (Array.isArray(workspaceTabsSnapshot) && workspaceTabsSnapshot.length > 0) {
      return workspaceTabsSnapshot
    }

    return [
      {
        ...fallbackEntryTab,
        content: getJsxSource(),
      },
      { ...fallbackStylesTab },
    ]
  }

  const resolveWorkspaceEntryTab = workspaceTabs => {
    return (
      resolvePreviewEntryTab(workspaceTabs) ??
      workspaceTabs.find(tab => tab?.id === 'component') ??
      workspaceTabs[0] ??
      null
    )
  }

  const compileStyles = async mode => {
    const { cssFromSource, transformJsxSource } = await ensureCoreRuntime()
    const workspaceTabs = getWorkspaceTabsForPreview()
    const entryTab = resolveWorkspaceEntryTab(workspaceTabs)

    if (!entryTab) {
      clearStyleDiagnostics()
      return { css: '', styleModuleExportsByTabId: {} }
    }

    const runtimeSpecifiers = getWorkspaceRuntimeSpecifiers()
    const virtualModulePlan = planWorkspaceVirtualModules({
      tabs: workspaceTabs,
      entryTab,
      transformJsxSource,
      formatTransformDiagnosticsError,
      workspaceGraphCache,
      mode,
      runtimeSpecifiers,
    })

    if (!virtualModulePlan) {
      clearStyleDiagnostics()
      return { css: '', styleModuleExportsByTabId: {} }
    }

    const workspaceTabById = new Map(
      workspaceTabs
        .filter(tab => tab && typeof tab === 'object' && typeof tab.id === 'string')
        .map(tab => [tab.id, tab]),
    )

    const styleInputs = (
      Array.isArray(virtualModulePlan.includedStyleTabIds)
        ? virtualModulePlan.includedStyleTabIds
        : []
    )
      .map(tabId => workspaceTabById.get(tabId))
      .filter(tab => isStyleTab(tab))
      .map(tab => {
        const source = typeof tab.content === 'string' ? tab.content : ''
        const dialect = toStyleDialectForTab(tab)
        const fileName =
          (typeof tab.path === 'string' && tab.path.trim()) ||
          (typeof tab.name === 'string' && tab.name.trim()) ||
          (dialect === 'less'
            ? 'playground.less'
            : dialect === 'sass'
              ? 'playground.scss'
              : dialect === 'module'
                ? 'playground.module.css'
                : 'playground.css')

        return {
          id: tab.id,
          name:
            typeof tab.name === 'string' && tab.name.trim() ? tab.name.trim() : tab.id,
          source,
          dialect,
          fileName,
        }
      })

    const cacheKey = [
      mode,
      ...styleInputs.map(
        input =>
          `${input.id}\u0000${input.dialect}\u0000${input.fileName}\u0000${input.source}`,
      ),
    ].join('\u0001')

    if (compiledStylesCache.key === cacheKey && compiledStylesCache.value) {
      return compiledStylesCache.value
    }

    if (styleInputs.length === 0) {
      clearStyleDiagnostics()
      const output = { css: '', styleModuleExportsByTabId: {} }
      compiledStylesCache = {
        key: cacheKey,
        value: output,
      }
      return output
    }

    const shouldShowSpinner = styleInputs.some(input => input.dialect !== 'css')
    setStyleCompiling(shouldShowSpinner)

    try {
      const needsSass = styleInputs.some(input => input.dialect === 'sass')
      const needsLess = styleInputs.some(input => input.dialect === 'less')
      const needsLightningCss = styleInputs.some(input => input.dialect === 'module')
      const styleWarningLines = []

      const [sass, less, lightningcss] = await Promise.all([
        needsSass ? ensureSassCompiler() : Promise.resolve(null),
        needsLess ? ensureLessCompiler() : Promise.resolve(null),
        needsLightningCss ? ensureLightningCssWasm() : Promise.resolve(null),
      ])

      const compiledStyleParts = await Promise.all(
        styleInputs.map(async input => {
          if (input.dialect === 'css') {
            return {
              css: input.source,
              moduleExports: null,
            }
          }

          const options = {
            dialect: input.dialect,
            filename: input.fileName,
          }

          if (input.dialect === 'sass' && sass) {
            options.sass = sass
            options.sassOptions = {
              logger: {
                warn: message => {
                  const normalized =
                    typeof message === 'string' ? message.trim() : String(message)
                  if (!normalized) {
                    return
                  }

                  styleWarningLines.push(`[${input.name}] ${normalized}`)
                },
                debug: () => {
                  /* Ignore Sass debug output in diagnostics. */
                },
              },
            }
          } else if (input.dialect === 'less' && less) {
            options.less = less
          } else if (input.dialect === 'module' && lightningcss) {
            options.lightningcss = lightningcss
          }

          const result = await cssFromSource(input.source, options)
          if (!result.ok) {
            throw new Error(result.error.message)
          }

          const moduleExports = result.exports ?? null
          return {
            css:
              input.dialect === 'module'
                ? appendCssModuleLocalAliases(result.css, moduleExports)
                : result.css,
            moduleExports,
          }
        }),
      )

      const styleModuleExportsByTabId = {}
      const compiledCssParts = []

      for (let index = 0; index < styleInputs.length; index += 1) {
        const input = styleInputs[index]
        const part = compiledStyleParts[index]

        if (part && typeof part.css === 'string') {
          compiledCssParts.push(part.css)
        }

        if (input?.dialect !== 'module' || !part?.moduleExports) {
          continue
        }

        const normalizedModuleExports = {}
        for (const [localClassName, exportedValue] of Object.entries(
          part.moduleExports,
        )) {
          if (typeof localClassName !== 'string' || localClassName.length === 0) {
            continue
          }

          const normalizedValue = normalizeCssModuleExport(exportedValue)
          if (!normalizedValue) {
            continue
          }

          normalizedModuleExports[localClassName] = normalizedValue
        }

        styleModuleExportsByTabId[input.id] = normalizedModuleExports
      }

      const output = {
        css: compiledCssParts.join('\n\n'),
        styleModuleExportsByTabId,
      }
      if (styleWarningLines.length > 0) {
        setStyleDiagnosticsDetails({
          headline: 'Style compilation warnings.',
          lines: [...new Set(styleWarningLines)],
          level: 'warning',
        })
      } else {
        clearStyleDiagnostics()
      }
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
    if (!iframeRuntimeBridge || typeof iframeRuntimeBridge.dispose !== 'function') {
      return
    }

    iframeRuntimeBridge.dispose()
    iframeRuntimeBridge = null
  }

  const emitPreviewTelemetry = (name, details = {}) => {
    const payload = {
      name,
      at: performance.now(),
      ...details,
    }

    if (typeof onPreviewTelemetry === 'function') {
      onPreviewTelemetry(payload)
    }

    const telemetrySink = globalThis.__KNIGHTED_PREVIEW_TELEMETRY__
    if (Array.isArray(telemetrySink)) {
      telemetrySink.push(payload)
    }
  }

  const renderPreviewError = error => {
    disposeWorkspaceModules()
    disposeIframeBridge()
    const shouldSurfaceSpecificStatus =
      error instanceof Error && error.name === reactEntryTabCompatibilityErrorName
    setStatus(shouldSurfaceSpecificStatus ? error.message : 'Error', 'error')

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
    reactDom: getRuntimeSpecifier('reactDom'),
    reactDomClient: getRuntimeSpecifier('reactDomClient'),
  })

  const renderWorkspaceInIframe = async ({
    mode,
    cssText,
    styleModuleExportsByTabId = {},
  }) => {
    const workspaceTabs = getWorkspaceTabsForPreview()
    const entryTab = resolveWorkspaceEntryTab(workspaceTabs)

    if (!entryTab) {
      throw new Error('Unable to resolve workspace preview entry tab.')
    }

    if (mode === 'react') {
      const compatibilityError = getReactEntryTabCompatibilityError(entryTab)
      if (compatibilityError) {
        throw compatibilityError
      }
    }

    const { transformJsxSource } = await ensureCoreRuntime()
    const tabsForExecution = workspaceTabs
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
      styleModuleExportsByTabId,
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
    disposeWorkspaceVirtualModules = virtualModulePlan.dispose

    try {
      const renderTarget = getRenderTarget()
      if (!iframeRuntimeBridge || iframeRuntimeBridge.target !== renderTarget) {
        disposeIframeBridge()
        iframeRuntimeBridge = createWorkspaceIframePreviewBridge({
          target: renderTarget,
          onRuntimeError: error => {
            renderPreviewError(error)
          },
          onTelemetryEvent: event => emitPreviewTelemetry(event.name, event),
        })
      }

      await iframeRuntimeBridge.render({
        mode,
        entrySpecifier: virtualModulePlan.entrySpecifier,
        entryDisplaySpecifier: virtualModulePlan.entryDisplaySpecifier,
        entryExportName: virtualModulePlan.entryExportName,
        importMap: virtualModulePlan.importMap,
        cssText,
        hostPadding,
        backgroundColor: getPreviewBackgroundColor(),
        runtimeSpecifiers,
      })
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
    const compiledStyles = await compileStyles('dom')

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
      styleModuleExportsByTabId: compiledStyles.styleModuleExportsByTabId,
    })
  }

  const renderReact = async () => {
    const compiledStyles = await compileStyles('react')

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
      styleModuleExportsByTabId: compiledStyles.styleModuleExportsByTabId,
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
      emitPreviewTelemetry('render-start', {
        mode: renderMode.value,
      })
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
        emitPreviewTelemetry('render-complete', {
          mode: renderMode.value,
        })
        setStatus('Rendered', 'neutral')
        setRenderedStatus()
      } catch (error) {
        emitPreviewTelemetry('render-failed', {
          mode: renderMode.value,
          message: error instanceof Error ? error.message : String(error),
        })
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

    const now = Date.now()
    const timeSinceLastSchedule = now - lastScheduleRequestedAt
    lastScheduleRequestedAt = now

    const isLikelyTypingBurst =
      timeSinceLastSchedule > 0 && timeSinceLastSchedule < autoRenderBurstThresholdMs
    const debounceMs = isLikelyTypingBurst
      ? autoRenderTypingBurstDebounceMs
      : autoRenderDebounceMs

    if (scheduled) {
      clearTimeout(scheduled)
    }

    scheduled = setTimeout(() => {
      void renderPreview()
    }, debounceMs)
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
    updatePreviewBackgroundColor: color => {
      if (
        iframeRuntimeBridge &&
        typeof iframeRuntimeBridge.updateBackgroundColor === 'function'
      ) {
        iframeRuntimeBridge.updateBackgroundColor(color)
      }
    },
  }
}
