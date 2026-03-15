import { cssFromSource } from '@knighted/css/browser'
import { jsx } from '@knighted/jsx'
import { transpileJsxSource } from '@knighted/jsx/transpile'

const statusNode = document.getElementById('status')
const renderMode = document.getElementById('render-mode')
const autoRenderToggle = document.getElementById('auto-render')
const renderButton = document.getElementById('render-button')
const styleMode = document.getElementById('style-mode')
const shadowToggle = document.getElementById('shadow-toggle')
const jsxEditor = document.getElementById('jsx-editor')
const cssEditor = document.getElementById('css-editor')
const previewHost = document.getElementById('preview-host')
const styleWarning = document.getElementById('style-warning')
const cdnLoading = document.getElementById('cdn-loading')

const defaultJsx = [
  'const Button = ({ onClick }) => {',
  '  return <button onClick={onClick}>click me</button>',
  '}',
  '',
  'const App = () => {',
  '  const onClick = () => {',
  "    alert('clicked!')",
  '  }',
  '',
  '  return <Button onClick={onClick} />',
  '}',
  '',
].join('\n')

const defaultCss = `button {
  appearance: none;
  border: 1px solid rgba(122, 107, 255, 0.55);
  background: linear-gradient(135deg, #7a6bff, #5f4dff);
  color: #fff;
  padding: 10px 16px;
  border-radius: 10px;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    transform 120ms ease,
    box-shadow 120ms ease,
    filter 120ms ease;
  box-shadow:
    0 8px 20px rgba(95, 77, 255, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

button:hover {
  transform: translateY(-1px);
  filter: brightness(1.06);
}

button:active {
  transform: translateY(0);
  filter: brightness(0.98);
}

button:focus-visible {
  outline: 2px solid #9d91ff;
  outline-offset: 2px;
}
`

jsxEditor.value = defaultJsx
cssEditor.value = defaultCss

let scheduled = null
let reactRoot = null
let reactRuntime = null
let sassCompiler = null
let lessCompiler = null
let lightningCssWasm = null
let compiledStylesCache = {
  key: null,
  value: null,
}
let hasCompletedInitialRender = false

const styleLabels = {
  css: 'Native CSS',
  module: 'CSS Modules',
  less: 'Less',
  sass: 'Sass',
}

const setStatus = text => {
  statusNode.textContent = text
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

const getShadowRoot = () => {
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

const applyStyles = (target, cssText) => {
  if (!target) return

  const styleTag = document.createElement('style')
  styleTag.textContent = cssText
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

const looksLikeJsxSyntaxError = error =>
  error instanceof SyntaxError && /Unexpected token ['"]?</.test(error.message)

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

const loadSassCompilerFrom = async url => {
  const module = await import(url)
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
    sassCompiler = await loadSassCompilerFrom(
      'https://esm.sh/sass@1.93.2?conditions=browser',
    )
    return sassCompiler
  } catch (firstError) {
    try {
      sassCompiler = await loadSassCompilerFrom('https://jspm.dev/sass')
      return sassCompiler
    } catch (secondError) {
      const message =
        secondError instanceof Error
          ? secondError.message
          : firstError instanceof Error
            ? firstError.message
            : 'Unknown Sass module loading failure'
      throw new Error(`Unable to load Sass compiler for browser usage: ${message}`, {
        cause: secondError,
      })
    }
  }
}

const ensureLessCompiler = async () => {
  if (lessCompiler) return lessCompiler
  const module = await import('https://esm.sh/less')
  lessCompiler = module.default ?? module
  return lessCompiler
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

const tryLoadLightningCssWasm = async url => {
  const module = await import(url)
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
    lightningCssWasm = await tryLoadLightningCssWasm('https://esm.sh/@parcel/css-wasm')
    return lightningCssWasm
  } catch (firstError) {
    try {
      lightningCssWasm = await tryLoadLightningCssWasm('https://esm.sh/lightningcss-wasm')
      return lightningCssWasm
    } catch (secondError) {
      if (secondError instanceof Error) {
        throw new Error(`Unable to load Lightning CSS WASM: ${secondError.message}`, {
          cause: secondError,
        })
      }
      if (firstError instanceof Error) {
        throw new Error(`Unable to load Lightning CSS WASM: ${firstError.message}`, {
          cause: secondError,
        })
      }

      throw new Error(
        'Unable to load Lightning CSS WASM: Unknown module loading failure.',
        { cause: secondError },
      )
    }
  }
}

const compileStyles = async () => {
  const dialect = styleMode.value
  const cacheKey = `${dialect}\u0000${cssEditor.value}`
  if (compiledStylesCache.key === cacheKey && compiledStylesCache.value) {
    return compiledStylesCache.value
  }

  const shouldShowSpinner = dialect !== 'css'
  setStyleCompiling(shouldShowSpinner)

  if (!shouldShowSpinner) {
    const output = { css: cssEditor.value, moduleExports: null }
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

    const result = await cssFromSource(cssEditor.value, options)
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
  const userCode = jsxEditor.value
    .replace(/^\s*export\s+default\s+function\b/gm, '__defaultExport = function')
    .replace(/^\s*export\s+default\s+class\b/gm, '__defaultExport = class')
    .replace(/^\s*export\s+default\s+/gm, '__defaultExport = ')
    .replace(/^\s*export\s+(?=function|const|let|var|class)/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  try {
    const moduleFactory = createUserModuleFactory(userCode)
    return moduleFactory(helpers.jsx ?? jsx, helpers.reactJsx, helpers.React)
  } catch (error) {
    if (!looksLikeJsxSyntaxError(error)) {
      throw error
    }

    const transpiledUserCode = transpileJsxSource(userCode, {
      sourceType: 'script',
    }).code
    const moduleFactory = createUserModuleFactory(transpiledUserCode)

    if (helpers.React && helpers.reactJsx) {
      return moduleFactory(helpers.jsx ?? jsx, helpers.reactJsx, helpers.React)
    }

    const { React, reactJsx } = await ensureReactRuntime()
    return moduleFactory(helpers.jsx ?? jsx, helpers.reactJsx ?? reactJsx, React)
  }
}

const ensureReactRuntime = async () => {
  if (reactRuntime) return reactRuntime
  const [{ reactJsx }, React, { createRoot }] = await Promise.all([
    import('@knighted/jsx/react'),
    import('react'),
    import('react-dom/client'),
  ])

  reactRuntime = { reactJsx, React, createRoot }
  return reactRuntime
}

const renderDom = async () => {
  const target = getShadowRoot()
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
  const target = getShadowRoot()
  clearTarget(target)
  const compiledStyles = await compileStyles()
  applyStyles(target, compiledStyles.css)

  const { reactJsx, createRoot, React } = await ensureReactRuntime()
  const renderFn = await evaluateUserModule({ jsx: reactJsx, reactJsx })
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
    const target = getShadowRoot()
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

renderMode.addEventListener('change', maybeRender)
styleMode.addEventListener('change', maybeRender)
shadowToggle.addEventListener('change', maybeRender)
autoRenderToggle.addEventListener('change', () => {
  if (autoRenderToggle.checked) {
    renderPreview()
  }
})
renderButton.addEventListener('click', renderPreview)
jsxEditor.addEventListener('input', maybeRender)
cssEditor.addEventListener('input', maybeRender)

setStyleCompiling(false)
setCdnLoading(true)
renderPreview()
