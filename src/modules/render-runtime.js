import {
  collectTopLevelTransformMetadata,
  getFunctionLikeDeclarationNames,
  hasFunctionLikeDeclarationNamed,
} from './jsx-top-level-declarations.js'
import { ensureJsxTransformSource } from './jsx-transform-runtime.js'

export const createRenderRuntimeController = ({
  cdnImports,
  importFromCdnWithFallback,
  renderMode,
  styleMode,
  shadowToggle,
  isAutoRenderEnabled = () => false,
  getCssSource,
  getJsxSource,
  getPreviewHost,
  setPreviewHost,
  applyPreviewBackgroundColor,
  getPreviewBackgroundColor,
  clearStyleDiagnostics,
  setStyleDiagnosticsDetails,
  setStatus,
  setRenderedStatus,
  onFirstRenderComplete,
  setCdnLoading,
}) => {
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
  let topLevelTransformMetadataCache = {
    source: null,
    transformJsxSource: null,
    value: null,
  }
  let hasCompletedInitialRender = false

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

  const recreatePreviewHost = () => {
    const previewHost = getPreviewHost()
    const nextHost = document.createElement('div')
    nextHost.id = 'preview-host'
    nextHost.className = previewHost.className
    nextHost.setAttribute('role', 'region')
    nextHost.setAttribute('aria-label', 'Preview output')
    previewHost.replaceWith(nextHost)
    setPreviewHost(nextHost)

    applyPreviewBackgroundColor(getPreviewBackgroundColor())
  }

  const getRenderTarget = () => {
    const previewHost = getPreviewHost()

    if (!shadowToggle.checked && previewHost.shadowRoot) {
      /* ShadowRoot cannot be detached, so recreate the host for light DOM mode. */
      if (reactRoot) {
        reactRoot.unmount()
        reactRoot = null
      }
      recreatePreviewHost()
    }

    const currentHost = getPreviewHost()
    if (shadowToggle.checked) {
      if (!currentHost.shadowRoot) {
        currentHost.attachShadow({ mode: 'open' })
      }
      return currentHost.shadowRoot
    }

    return currentHost
  }

  const clearTarget = target => {
    if (!target) return
    if (reactRoot) {
      reactRoot.unmount()
      reactRoot = null
    }
    target.innerHTML = ''
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

  const shouldAttemptTranspileFallback = error => {
    if (error instanceof SyntaxError) {
      return true
    }

    if (!(error instanceof Error)) {
      return false
    }

    return /Unexpected token|Cannot use import statement|Unexpected identifier/.test(
      error.message,
    )
  }

  const isImportRange = range =>
    Array.isArray(range) &&
    range.length === 2 &&
    Number.isInteger(range[0]) &&
    Number.isInteger(range[1])

  const stripImportDeclarations = (code, imports) => {
    const ranges = imports
      .map(entry => entry?.range)
      .filter(isImportRange)
      .slice()
      .sort((first, second) => second[0] - first[0])

    let output = code

    for (const [start, end] of ranges) {
      if (start < 0 || end < start || end > output.length) {
        continue
      }

      output = `${output.slice(0, start)}${output.slice(end)}`
    }

    return output
  }

  const buildRuntimeImportPlan = imports => {
    const preamble = []
    const unsupportedSources = new Set()
    let requiresReactRuntime = false
    let hasReactRuntimeAlias = false

    const ensureReactRuntimeAlias = () => {
      if (hasReactRuntimeAlias) {
        return '__knightedReactRuntime'
      }

      hasReactRuntimeAlias = true
      preamble.push('const __knightedReactRuntime = React')
      return '__knightedReactRuntime'
    }

    for (const entry of imports) {
      if (!entry || entry.importKind !== 'value') {
        continue
      }

      if (entry.source !== 'react') {
        unsupportedSources.add(entry.source)
        continue
      }

      requiresReactRuntime = true

      for (const binding of entry.bindings ?? []) {
        if (!binding || binding.isTypeOnly) {
          continue
        }

        if (binding.kind === 'default' || binding.kind === 'namespace') {
          if (binding.local === 'React') {
            continue
          }

          preamble.push(`const ${binding.local} = React`)
          continue
        }

        if (binding.kind === 'named') {
          if (binding.imported === 'default') {
            if (binding.local === 'React') {
              continue
            }

            preamble.push(`const ${binding.local} = React`)
          } else {
            if (binding.local === 'React') {
              const reactRuntimeAlias = ensureReactRuntimeAlias()
              preamble.push(`const React = ${reactRuntimeAlias}.${binding.imported}`)
            } else {
              preamble.push(`const ${binding.local} = React.${binding.imported}`)
            }
          }
        }
      }
    }

    return {
      preamble,
      requiresReactRuntime,
      unsupportedSources: [...unsupportedSources],
    }
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

  const createUserModuleFactory = source =>
    new Function(
      'jsx',
      'reactJsx',
      'React',
      `"use strict";\n${source}\nconst __renderComponent = (Component, jsxTag) => {\n  if (typeof Component !== 'function') return null;\n  return jsxTag\`<\${Component} />\`;\n};\nconst __renderEntry = jsxTag => {\n  if (typeof App !== 'function') return null;\n  return __renderComponent(App, jsxTag);\n};\nreturn __renderEntry;`,
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

  const evaluateUserModule = async (helpers = {}) => {
    const { jsx, transformJsxSource } = await ensureCoreRuntime()
    let runtimeHelpers = helpers
    const source = getJsxSource()
    const executableSource = isAutoRenderEnabled()
      ? withImplicitAppWrapper(source, transformJsxSource)
      : source
    const userCode = executableSource
      .replace(
        /^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/gm,
        (match, identifier) => {
          if (identifier === 'App') {
            return ''
          }

          return `const App = ${identifier}`
        },
      )
      .replace(/^\s*export\s+default\s+/gm, 'const App = ')
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
          sourceType: 'module',
          createElement: 'jsx.createElement',
          fragment: 'jsx.Fragment',
          typescript: 'strip',
        },
        react: {
          sourceType: 'module',
          createElement: 'React.createElement',
          fragment: 'React.Fragment',
          typescript: 'strip',
        },
      }
      const transformedResult = transformJsxSource(
        userCode,
        transpileOptionsByMode[transpileMode],
      )

      if (transformedResult.diagnostics.length > 0) {
        throw new Error(formatTransformDiagnosticsError(transformedResult.diagnostics), {
          cause: error,
        })
      }

      const importAnalysisResult = transformJsxSource(transformedResult.code, {
        sourceType: 'module',
        typescript: 'preserve',
      })

      if (importAnalysisResult.diagnostics.length > 0) {
        throw new Error(
          formatTransformDiagnosticsError(importAnalysisResult.diagnostics),
          {
            cause: error,
          },
        )
      }

      const runtimeImportPlan = buildRuntimeImportPlan(importAnalysisResult.imports)

      if (runtimeImportPlan.unsupportedSources.length > 0) {
        throw new Error(
          `Unsupported runtime imports in playground execution: ${runtimeImportPlan.unsupportedSources
            .map(specifier => `'${specifier}'`)
            .join(', ')}.`,
          {
            cause: error,
          },
        )
      }

      if (runtimeImportPlan.requiresReactRuntime && !runtimeHelpers.React) {
        const { React, reactJsx } = await ensureReactRuntime()
        runtimeHelpers = {
          ...runtimeHelpers,
          React,
          reactJsx: runtimeHelpers.reactJsx ?? reactJsx,
        }
      }

      const runtimeCode = stripImportDeclarations(
        transformedResult.code,
        importAnalysisResult.imports,
      )
      const executableUserCode = runtimeImportPlan.preamble.length
        ? `${runtimeImportPlan.preamble.join('\n')}\n${runtimeCode}`
        : runtimeCode

      const moduleFactory = createUserModuleFactory(executableUserCode)

      if (runtimeHelpers.React && runtimeHelpers.reactJsx) {
        return moduleFactory(
          runtimeHelpers.jsx ?? jsx,
          runtimeHelpers.reactJsx,
          runtimeHelpers.React,
        )
      }

      if (transpileMode === 'dom') {
        return moduleFactory(
          runtimeHelpers.jsx ?? jsx,
          runtimeHelpers.reactJsx,
          runtimeHelpers.React,
        )
      }

      const { React, reactJsx } = await ensureReactRuntime()
      return moduleFactory(
        runtimeHelpers.jsx ?? jsx,
        runtimeHelpers.reactJsx ?? reactJsx,
        React,
      )
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

  const hasComponentSource = () => getJsxSource().trim().length > 0

  const clearPreview = () => {
    const target = getRenderTarget()
    clearTarget(target)
  }

  const renderDom = async () => {
    const { jsx } = await ensureCoreRuntime()
    const target = getRenderTarget()
    clearTarget(target)
    const compiledStyles = await compileStyles()
    applyStyles(target, compiledStyles.css)

    if (!hasComponentSource()) {
      return
    }

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
      throw new Error('Expected a function or const named App.')
    }
  }

  const renderReact = async () => {
    const target = getRenderTarget()
    clearTarget(target)
    const compiledStyles = await compileStyles()
    applyStyles(target, compiledStyles.css)

    if (!hasComponentSource()) {
      return
    }

    const { reactJsx, createRoot, React } = await ensureReactRuntime()
    const renderFn = await evaluateUserModule({ jsx: reactJsx, reactJsx, React })
    if (!renderFn) {
      throw new Error('Expected a function or const named App.')
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
      throw new Error('Expected a function or const named App.')
    }
    reactRoot.render(output)
  }

  const renderPreview = async () => {
    scheduled = null
    setStatus(hasCompletedInitialRender ? 'Rendering…' : 'Loading CDN assets…', 'pending')

    try {
      if (renderMode.value === 'react') {
        await renderReact()
      } else {
        await renderDom()
      }
      setStatus('Rendered', 'neutral')
      setRenderedStatus()
    } catch (error) {
      setStatus('Error', 'error')
      const target = getRenderTarget()
      clearTarget(target)
      const message = document.createElement('pre')
      message.textContent = error instanceof Error ? error.message : String(error)
      message.style.color = '#ff9aa2'
      target.append(message)
    } finally {
      if (!hasCompletedInitialRender) {
        hasCompletedInitialRender = true
        onFirstRenderComplete()
        setCdnLoading(false)
      }
    }
  }

  const scheduleRender = () => {
    if (scheduled) {
      clearTimeout(scheduled)
    }

    scheduled = setTimeout(renderPreview, 200)
  }

  return {
    clearPreview,
    renderPreview,
    scheduleRender,
    setStyleCompiling,
  }
}
