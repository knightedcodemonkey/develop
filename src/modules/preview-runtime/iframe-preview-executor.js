import {
  createPreviewChannelId,
  createPreviewInitPayload,
  isPreviewProtocolMessage,
  previewProtocolMessageTypes,
  previewProtocolVersion,
  toPreviewProtocolMessage,
} from './iframe-preview-protocol.js'

const previewIframeSandbox = 'allow-scripts allow-modals allow-forms allow-popups'

const createIframeHost = target => {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Preview iframe runtime')
  iframe.setAttribute('sandbox', previewIframeSandbox)

  target.replaceChildren(iframe)
  return iframe
}

const escapeJsonForScriptTag = value =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')

const createIframeShellDocument = ({ channelId, parentOrigin, importMap }) => {
  const bootstrapPayload = {
    channelId,
    parentOrigin,
    protocolVersion: previewProtocolVersion,
  }

  const importMapJson = escapeJsonForScriptTag(importMap ?? {})
  const bootstrapJson = escapeJsonForScriptTag(bootstrapPayload)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script type="importmap">${importMapJson}</script>
  </head>
  <body>
    <script type="module">
      const __knightedBootstrap = ${bootstrapJson}
      const __knightedChannelId = __knightedBootstrap.channelId
      const __knightedParentOrigin = __knightedBootstrap.parentOrigin
      const __knightedProtocolVersion = __knightedBootstrap.protocolVersion

      const __knightedMessageTypes = {
        ready: 'ready',
        init: 'init',
        configPatch: 'config-patch',
        rendered: 'rendered',
        runtimeError: 'runtime-error',
      }

      const __knightedState = {
        initialized: false,
        entrySpecifier: '',
      }

      const __knightedRuntimeErrorFingerprints = new Set()

      const __knightedToMessage = (type, payload = {}) => ({
        __knightedPreview: true,
        version: __knightedProtocolVersion,
        channelId: __knightedChannelId,
        type,
        ...payload,
      })

      const __knightedIsValidMessage = data => {
        return (
          typeof data === 'object' &&
          data !== null &&
          data.__knightedPreview === true &&
          data.version === __knightedProtocolVersion &&
          data.channelId === __knightedChannelId &&
          typeof data.type === 'string'
        )
      }

      const __knightedEmit = (type, payload = {}) => {
        parent.postMessage(__knightedToMessage(type, payload), __knightedParentOrigin)
      }

      const __knightedToBaseStyles = hostPadding => {
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
          '  padding: var(--preview-host-padding, ' + resolvedPadding + ');',
          '  overflow-y: auto;',
          '  overflow-x: hidden;',
          '}',
        ].join('\\n')
      }

      const __knightedApplyVisualConfig = ({ cssText = '', hostPadding = '', backgroundColor = '' }) => {
        let styleElement = document.getElementById('knighted-preview-styles')
        if (!(styleElement instanceof HTMLStyleElement)) {
          styleElement = document.createElement('style')
          styleElement.id = 'knighted-preview-styles'
          document.head.append(styleElement)
        }

        styleElement.textContent = __knightedToBaseStyles(hostPadding) + '\\n' + String(cssText)

        if (typeof hostPadding === 'string' && hostPadding.trim().length > 0) {
          document.documentElement.style.setProperty('--preview-host-padding', hostPadding.trim())
        } else {
          document.documentElement.style.removeProperty('--preview-host-padding')
        }

        if (typeof backgroundColor === 'string' && backgroundColor.length > 0) {
          document.documentElement.style.backgroundColor = backgroundColor
          document.body.style.backgroundColor = backgroundColor
          return
        }

        document.documentElement.style.removeProperty('background-color')
        document.body.style.removeProperty('background-color')
      }

      const __knightedToErrorDetails = (error, origin) => {
        const message = error instanceof Error ? error.message : String(error)
        const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : ''
        const moduleMatch = stack.match(/knighted-workspace\\/([^\\n\\s)]+)/)

        return {
          origin,
          entrySpecifier: __knightedState.entrySpecifier,
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
        __knightedEmit(__knightedMessageTypes.runtimeError, details)
      }

      const __knightedRender = async config => {
        const { mode, entrySpecifier, entryExportName, runtimeSpecifiers } = config

        __knightedState.entrySpecifier =
          typeof entrySpecifier === 'string' ? entrySpecifier : ''

        __knightedApplyVisualConfig(config)
        document.querySelectorAll('knighted-preview-root').forEach(node => node.remove())

        try {
          const entryModule = await import(entrySpecifier)
          const App = entryModule.default ?? entryModule.App ?? entryModule[entryExportName]

          if (typeof App !== 'function') {
            throw new Error('Expected a function or const named App.')
          }

          if (mode === 'react') {
            const [{ createRoot }, { reactJsx }] = await Promise.all([
              import(runtimeSpecifiers.reactDomClient),
              import(runtimeSpecifiers.jsxReact),
            ])

            const output = reactJsx\`<\${App} />\`
            if (!output) {
              throw new Error('Expected a function or const named App.')
            }

            const host = document.createElement('knighted-preview-root')
            document.body.append(host)
            const root = createRoot(host)
            root.render(output)
          } else {
            const { jsx } = await import(runtimeSpecifiers.jsxDom)
            const output = jsx\`<\${App} />\`

            if (!(output instanceof Node)) {
              throw new Error('Expected a function or const named App.')
            }

            document.body.append(output)
          }

          __knightedEmit(__knightedMessageTypes.rendered)
        } catch (error) {
          const details = __knightedToErrorDetails(error, 'execution')
          __knightedEmitRuntimeError(details)
        }
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
        const details = __knightedToErrorDetails(
          event?.reason ?? 'Unknown promise rejection',
          'promise',
        )
        __knightedEmitRuntimeError(details)
      })

      window.addEventListener('message', event => {
        if (event.origin !== __knightedParentOrigin || !__knightedIsValidMessage(event.data)) {
          return
        }

        const data = event.data
        if (data.type === __knightedMessageTypes.configPatch) {
          __knightedApplyVisualConfig(data)
          return
        }

        if (data.type !== __knightedMessageTypes.init || __knightedState.initialized) {
          return
        }

        __knightedState.initialized = true
        void __knightedRender(data)
      })

      __knightedEmit(__knightedMessageTypes.ready)
    </script>
  </body>
</html>`
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
  onTelemetryEvent,
}) => {
  const iframe = createIframeHost(target)
  const channelId = createPreviewChannelId()

  const emitTelemetry = (name, details = {}) => {
    if (typeof onTelemetryEvent === 'function') {
      onTelemetryEvent({
        name,
        at: performance.now(),
        channelId,
        ...details,
      })
    }
  }

  return new Promise((resolve, reject) => {
    let active = true
    let hasRendered = false
    let hasInitialized = false

    const sendInitPayload = () => {
      if (!active || hasInitialized || !iframe.contentWindow) {
        return
      }

      hasInitialized = true
      const payload = createPreviewInitPayload({
        mode,
        entrySpecifier,
        entryExportName,
        runtimeSpecifiers,
        cssText,
        hostPadding,
        backgroundColor,
        importMap,
        parentOrigin: globalThis.location.origin,
      })

      iframe.contentWindow.postMessage(
        toPreviewProtocolMessage({
          channelId,
          type: previewProtocolMessageTypes.init,
          payload,
        }),
        '*',
      )
    }

    const onMessage = event => {
      if (!active) {
        return
      }

      const data = event?.data
      if (!isPreviewProtocolMessage({ data, channelId })) {
        return
      }

      if (data.type === previewProtocolMessageTypes.ready) {
        emitTelemetry('iframe-ready')
        sendInitPayload()
        return
      }

      if (data.type === previewProtocolMessageTypes.rendered) {
        if (!hasRendered) {
          hasRendered = true
          clearTimeout(timer)
          emitTelemetry('rendered')
          resolve({
            iframe,
            dispose: cleanup,
            updateBackgroundColor: nextColor => {
              if (!active || !iframe.contentWindow) {
                return
              }

              iframe.contentWindow.postMessage(
                toPreviewProtocolMessage({
                  channelId,
                  type: previewProtocolMessageTypes.configPatch,
                  payload: {
                    backgroundColor: typeof nextColor === 'string' ? nextColor : '',
                  },
                }),
                '*',
              )
            },
          })
        }

        return
      }

      if (data.type === previewProtocolMessageTypes.runtimeError) {
        const runtimeError = toIframeRuntimeError(data)
        emitTelemetry('runtime-error', {
          origin: typeof data?.origin === 'string' ? data.origin : '',
        })

        if (hasRendered) {
          cleanup()
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
      emitTelemetry('timeout')
      reject(new Error('Workspace preview execution timed out.'))
    }, timeoutMs)

    window.addEventListener('message', onMessage)
    iframe.srcdoc = createIframeShellDocument({
      channelId,
      parentOrigin: globalThis.location.origin,
      importMap,
    })
  })
}
