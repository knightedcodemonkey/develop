const createIframeHost = target => {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Preview iframe runtime')
  iframe.setAttribute(
    'sandbox',
    'allow-scripts allow-modals allow-forms allow-popups allow-same-origin',
  )

  target.replaceChildren(iframe)
  return iframe
}

const toIframeBaseStyles = hostPadding => {
  const resolvedPadding =
    typeof hostPadding === 'string' && hostPadding.trim().length > 0
      ? hostPadding.trim()
      : '18px'

  return [
    'html, body {',
    '  margin: 0;',
    '  min-height: 100%;',
    '  background: transparent;',
    '}',
    'html {',
    '  box-sizing: border-box;',
    '}',
    '*, *::before, *::after {',
    '  box-sizing: inherit;',
    '}',
    'body {',
    `  padding: var(--preview-host-padding, ${resolvedPadding});`,
    '  overflow-y: auto;',
    '  overflow-x: hidden;',
    '}',
  ].join('\n')
}

const createBootstrapScript = ({
  mode,
  entrySpecifier,
  entryExportName,
  runtimeSpecifiers,
  channelId,
}) => {
  const isReactMode = mode === 'react'
  const reactImports = isReactMode
    ? `
import React from '${runtimeSpecifiers.react}'
import { createRoot } from '${runtimeSpecifiers.reactDomClient}'
import { reactJsx as __knightedReactJsxRuntime } from '${runtimeSpecifiers.jsxReact}'
`
    : ''

  const domImports = isReactMode
    ? ''
    : `
import { jsx as __knightedDomJsxRuntime } from '${runtimeSpecifiers.jsxDom}'
`

  const renderCode = isReactMode
    ? `
  const output = __knightedReactJsxRuntime\`<\${App} />\`
  if (!output) {
    throw new Error('Expected a function or const named App.')
  }
  const host = document.createElement('knighted-preview-root')
  document.body.append(host)
  const root = createRoot(host)
  root.render(output)
`
    : `
  const output = __knightedDomJsxRuntime\`<\${App} />\`
  if (!(output instanceof Node)) {
    throw new Error('Expected a function or const named App.')
  }
  document.body.append(output)
`

  return `
${reactImports}
${domImports}
const __knightedChannelId = ${JSON.stringify(channelId)}
const __knightedEntrySpecifier = ${JSON.stringify(entrySpecifier)}
const __knightedEmit = payload => {
  parent.postMessage({ __knightedPreview: true, channelId: __knightedChannelId, ...payload }, '*')
}

const __knightedRuntimeErrorFingerprints = new Set()
const __knightedToErrorDetails = (error, origin) => {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : ''
  const moduleMatch = stack.match(/knighted-workspace\\/([^\\n\\s)]+)/)

  return {
    origin,
    entrySpecifier: __knightedEntrySpecifier,
    message: String(message || 'Unknown runtime error'),
    stack,
    moduleContext: moduleMatch ? 'knighted-workspace/' + moduleMatch[1] : '',
  }
}

const __knightedEmitRuntimeError = details => {
  const isMissingReference =
    typeof details.message === 'string' &&
    details.message.toLowerCase().includes(' is not defined')
  const isTransientOrigin = details.origin === 'window-error' || details.origin === 'promise'
  if (isMissingReference && isTransientOrigin) {
    return
  }

  const fingerprint =
    String(details.origin) +
    '|' +
    String(details.entrySpecifier) +
    '|' +
    String(details.moduleContext) +
    '|' +
    String(details.message)
  if (__knightedRuntimeErrorFingerprints.has(fingerprint)) {
    return
  }

  __knightedRuntimeErrorFingerprints.add(fingerprint)
  __knightedEmit({ type: 'runtime-error', ...details })
}

window.addEventListener('error', event => {
  event.preventDefault()
  const details = __knightedToErrorDetails(
    event?.error ?? event?.message ?? 'Unknown runtime error',
    'window-error',
  )
  __knightedEmitRuntimeError(details)
})

window.addEventListener('unhandledrejection', event => {
  event.preventDefault()
  const reason = event?.reason
  const details = __knightedToErrorDetails(reason ?? 'Unknown promise rejection', 'promise')
  __knightedEmitRuntimeError(details)
})

const __knightedRun = async () => {
  try {
    const entryModule = await import(${JSON.stringify(entrySpecifier)})
    const App =
      entryModule.default ?? entryModule.App ?? entryModule[${JSON.stringify(entryExportName)}]

    if (typeof App !== 'function') {
      throw new Error('Expected a function or const named App.')
    }

${renderCode}
    __knightedEmit({ type: 'rendered' })
  } catch (error) {
    const details = __knightedToErrorDetails(error, 'execution')
    __knightedEmitRuntimeError(details)
  }
}

void __knightedRun()
`
}

const toIframeRuntimeError = data => {
  const message =
    typeof data?.message === 'string' && data.message.length > 0
      ? data.message
      : 'Unknown runtime error'

  const lines = [`[runtime] ${message}`]

  if (typeof data?.entrySpecifier === 'string' && data.entrySpecifier.length > 0) {
    lines.push(`Entry: ${data.entrySpecifier}`)
  }

  if (typeof data?.moduleContext === 'string' && data.moduleContext.length > 0) {
    lines.push(`Module: ${data.moduleContext}`)
  }

  if (typeof data?.origin === 'string' && data.origin.length > 0) {
    lines.push(`Source: ${data.origin}`)
  }

  const error = new Error(lines.join('\n'))

  if (typeof data?.stack === 'string' && data.stack.length > 0) {
    error.stack = data.stack
  }

  return error
}

export const executeWorkspaceIframePreview = ({
  target,
  mode,
  entrySpecifier,
  entryExportName,
  importMap,
  cssText,
  hostPadding = '',
  backgroundColor = '',
  runtimeSpecifiers,
  timeoutMs = 12000,
  onRuntimeError,
}) => {
  const iframe = createIframeHost(target)
  const channelId = `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise((resolve, reject) => {
    let active = true
    let hasRendered = false

    const onMessage = event => {
      if (!active) {
        return
      }

      const data = event?.data
      if (!data || data.__knightedPreview !== true || data.channelId !== channelId) {
        return
      }

      if (data.type === 'rendered') {
        if (!hasRendered) {
          hasRendered = true
          clearTimeout(timer)
          resolve({
            iframe,
            dispose: cleanup,
          })
        }
        return
      }

      if (data.type === 'error' || data.type === 'runtime-error') {
        const runtimeError = toIframeRuntimeError(data)

        if (hasRendered) {
          if (typeof onRuntimeError === 'function') {
            onRuntimeError(runtimeError)
          }
          return
        }

        cleanup()
        reject(runtimeError)
      }
    }

    const cleanup = () => {
      if (!active) {
        return
      }

      active = false
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Workspace preview execution timed out.'))
    }, timeoutMs)

    window.addEventListener('message', onMessage)

    const bootstrapScript = createBootstrapScript({
      mode,
      entrySpecifier,
      entryExportName,
      runtimeSpecifiers,
      channelId,
    })

    const doc = iframe.contentDocument
    if (!doc) {
      cleanup()
      reject(new Error('Unable to initialize preview iframe document.'))
      return
    }

    doc.open()
    doc.write('<!doctype html><html><head></head><body></body></html>')
    doc.close()

    const styleElement = doc.createElement('style')
    styleElement.textContent = `${toIframeBaseStyles(hostPadding)}\n${cssText}`
    doc.head.append(styleElement)

    if (typeof hostPadding === 'string' && hostPadding.trim().length > 0) {
      doc.documentElement.style.setProperty('--preview-host-padding', hostPadding.trim())
    }

    if (typeof backgroundColor === 'string' && backgroundColor.length > 0) {
      doc.documentElement.style.backgroundColor = backgroundColor
      doc.body.style.backgroundColor = backgroundColor
    }

    const importMapScript = doc.createElement('script')
    importMapScript.type = 'importmap'
    importMapScript.textContent = JSON.stringify(importMap)
    doc.head.append(importMapScript)

    const moduleScript = doc.createElement('script')
    moduleScript.type = 'module'
    moduleScript.textContent = bootstrapScript
    doc.body.append(moduleScript)
  })
}
