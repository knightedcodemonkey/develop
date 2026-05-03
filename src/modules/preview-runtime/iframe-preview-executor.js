import {
  createPreviewChannelId,
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
        render: 'render',
        configPatch: 'config-patch',
        rendered: 'rendered',
        runtimeError: 'runtime-error',
      }

      const __knightedState = {
        entrySpecifier: '',
        reactRoot: null,
        renderedNodes: [],
        visualConfig: {
          cssText: '',
          userStyleSheets: [],
          hostPadding: '',
          backgroundColor: '',
        },
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

      const __knightedApplyVisualConfig = ({
        cssText = '',
        userStyleSheets = [],
        hostPadding = '',
        backgroundColor = '',
      }) => {
        const normalizedUserStyleSheets = Array.isArray(userStyleSheets)
          ? userStyleSheets
              .filter(styleText => typeof styleText === 'string')
              .map(styleText => String(styleText))
          : []
        const fallbackUserStyleText = typeof cssText === 'string' ? cssText : ''
        const desiredUserStyleSheets =
          normalizedUserStyleSheets.length > 0
            ? normalizedUserStyleSheets
            : [fallbackUserStyleText]

        __knightedState.visualConfig = {
          cssText: fallbackUserStyleText,
          userStyleSheets: desiredUserStyleSheets,
          hostPadding: typeof hostPadding === 'string' ? hostPadding : '',
          backgroundColor: typeof backgroundColor === 'string' ? backgroundColor : '',
        }

        let baseStyleElement = document.getElementById('knighted-preview-base-styles')
        if (!(baseStyleElement instanceof HTMLStyleElement)) {
          baseStyleElement = document.createElement('style')
          baseStyleElement.id = 'knighted-preview-base-styles'
          document.head.append(baseStyleElement)
        }

        const desiredUserStyleElementIds = __knightedState.visualConfig.userStyleSheets.map(
          (_styleText, index) =>
            index === 0
              ? 'knighted-preview-user-styles'
              : 'knighted-preview-user-styles-' + index,
        )

        const desiredUserStyleElementIdSet = new Set(desiredUserStyleElementIds)
        const existingUserStyleElements = Array.from(
          document.head.querySelectorAll('style[id^="knighted-preview-user-styles"]'),
        )
        for (const existingUserStyleElement of existingUserStyleElements) {
          if (!desiredUserStyleElementIdSet.has(existingUserStyleElement.id)) {
            existingUserStyleElement.remove()
          }
        }

        const userStyleElements = []
        let previousPreviewStyleElement = baseStyleElement

        for (const styleElementId of desiredUserStyleElementIds) {
          let userStyleElement = document.getElementById(styleElementId)
          if (!(userStyleElement instanceof HTMLStyleElement)) {
            userStyleElement = document.createElement('style')
            userStyleElement.id = styleElementId

            if (
              previousPreviewStyleElement instanceof HTMLStyleElement &&
              previousPreviewStyleElement.parentNode === document.head
            ) {
              document.head.insertBefore(
                userStyleElement,
                previousPreviewStyleElement.nextSibling,
              )
            } else {
              document.head.append(userStyleElement)
            }
          }

          userStyleElements.push(userStyleElement)
          previousPreviewStyleElement = userStyleElement
        }

        const firstUserStyleElement = userStyleElements[0]
        const isBaseAfterUser =
          firstUserStyleElement instanceof HTMLStyleElement &&
          (baseStyleElement.compareDocumentPosition(firstUserStyleElement) &
            Node.DOCUMENT_POSITION_PRECEDING) !==
          0
        if (isBaseAfterUser && firstUserStyleElement instanceof HTMLStyleElement) {
          document.head.insertBefore(baseStyleElement, firstUserStyleElement)
        }

        baseStyleElement.textContent = __knightedToBaseStyles(
          __knightedState.visualConfig.hostPadding,
        )

        for (let index = 0; index < userStyleElements.length; index += 1) {
          const userStyleElement = userStyleElements[index]
          userStyleElement.textContent = String(
            __knightedState.visualConfig.userStyleSheets[index] ?? '',
          )
        }

        if (__knightedState.visualConfig.hostPadding.trim().length > 0) {
          document.documentElement.style.setProperty(
            '--preview-host-padding',
            __knightedState.visualConfig.hostPadding.trim(),
          )
        } else {
          document.documentElement.style.removeProperty('--preview-host-padding')
        }

        if (__knightedState.visualConfig.backgroundColor.length > 0) {
          document.documentElement.style.backgroundColor =
            __knightedState.visualConfig.backgroundColor
          document.body.style.backgroundColor = __knightedState.visualConfig.backgroundColor
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
        const missingReferenceName = (() => {
          if (typeof details.message !== 'string') {
            return ''
          }

          const normalizedMessage = details.message.trim()
          const missingReferenceMatch = normalizedMessage.match(
            /^([A-Za-z_$][\\w$]*) is not defined\\b/i,
          )
          if (missingReferenceMatch?.[1]) {
            return missingReferenceMatch[1]
          }

          const missingVariableMatch = normalizedMessage.match(
            /^can't find variable:\\s*([A-Za-z_$][\\w$]*)\\b/i,
          )
          return missingVariableMatch?.[1] ?? ''
        })()

        const isLikelyTransientReference =
          missingReferenceName.length > 0 &&
          missingReferenceName.length <= 3 &&
          missingReferenceName === missingReferenceName.toLowerCase()
        const isTransientOrigin = details.origin === 'window-error' || details.origin === 'promise'

        if (isLikelyTransientReference && isTransientOrigin) {
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
        const {
          mode,
          entrySpecifier,
          entryDisplaySpecifier,
          entryExportName,
          runtimeSpecifiers,
        } = config

        __knightedState.entrySpecifier =
          typeof entryDisplaySpecifier === 'string' && entryDisplaySpecifier.length > 0
            ? entryDisplaySpecifier
            : typeof entrySpecifier === 'string'
              ? entrySpecifier
              : ''

        __knightedApplyVisualConfig(config)

        if (
          __knightedState.reactRoot &&
          typeof __knightedState.reactRoot.unmount === 'function'
        ) {
          __knightedState.reactRoot.unmount()
          __knightedState.reactRoot = null
        }

        if (Array.isArray(__knightedState.renderedNodes)) {
          for (const node of __knightedState.renderedNodes) {
            if (node instanceof Node && node.parentNode) {
              node.parentNode.removeChild(node)
            }
          }
          __knightedState.renderedNodes = []
        }

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
            __knightedState.reactRoot = root
            __knightedState.renderedNodes = [host]
            root.render(output)
          } else {
            const { jsx } = await import(runtimeSpecifiers.jsxDom)
            const output = jsx\`<\${App} />\`

            if (!(output instanceof Node)) {
              throw new Error('Expected a function or const named App.')
            }

            const domNodes =
              output instanceof DocumentFragment ? Array.from(output.childNodes) : [output]

            document.body.append(output)
            __knightedState.renderedNodes = domNodes
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
          const patch =
            data && typeof data.payload === 'object' && data.payload !== null
              ? data.payload
              : data && typeof data === 'object'
                ? data
                : {}
          __knightedApplyVisualConfig({
            ...__knightedState.visualConfig,
            ...patch,
          })
          return
        }

        if (data.type !== __knightedMessageTypes.render) {
          return
        }

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

export const createWorkspaceIframePreviewBridge = ({
  target,
  parentOrigin = globalThis.location.origin,
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

  let active = true
  let ready = false
  let resolveReady = () => {}
  const readyWaiters = new Set()
  const readyPromise = new Promise(resolve => {
    resolveReady = resolve
  })

  let pendingRender = null

  const waitForReady = timeoutMs => {
    if (ready) {
      return Promise.resolve()
    }

    if (!active) {
      return Promise.reject(new Error('Preview iframe bridge is not active.'))
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        readyWaiters.delete(onDisposed)
        reject(new Error('Workspace preview iframe did not become ready before timeout.'))
      }, timeoutMs)

      const onReady = () => {
        clearTimeout(timer)
        readyWaiters.delete(onDisposed)
        resolve()
      }

      const onDisposed = error => {
        clearTimeout(timer)
        reject(
          error instanceof Error
            ? error
            : new Error('Preview iframe bridge was disposed before readiness.'),
        )
      }

      readyPromise.then(onReady)
      readyWaiters.add(onDisposed)
    })
  }

  const cleanupPendingRender = (error = null) => {
    if (!pendingRender) {
      return
    }

    const { timer, resolve, reject } = pendingRender
    clearTimeout(timer)
    pendingRender = null

    if (error) {
      reject(error)
      return
    }

    resolve()
  }

  const postMessageToIframe = ({ type, payload = {} }) => {
    if (!active || !iframe.contentWindow) {
      return false
    }

    iframe.contentWindow.postMessage(
      toPreviewProtocolMessage({
        channelId,
        type,
        payload,
      }),
      '*',
    )

    return true
  }

  const onMessage = event => {
    if (!active) {
      return
    }

    if (!iframe.contentWindow || event.source !== iframe.contentWindow) {
      return
    }

    const data = event?.data
    if (!isPreviewProtocolMessage({ data, channelId })) {
      return
    }

    if (data.type === previewProtocolMessageTypes.ready) {
      ready = true
      emitTelemetry('iframe-ready')
      resolveReady()
      return
    }

    if (data.type === previewProtocolMessageTypes.rendered) {
      emitTelemetry('rendered')
      cleanupPendingRender()
      return
    }

    if (data.type === previewProtocolMessageTypes.runtimeError) {
      emitTelemetry('runtime-error', {
        origin: typeof data?.origin === 'string' ? data.origin : '',
      })

      const runtimeError = toIframeRuntimeError(data)
      if (pendingRender) {
        cleanupPendingRender(runtimeError)
        return
      }

      if (typeof onRuntimeError === 'function') {
        onRuntimeError(runtimeError)
      }
    }
  }

  window.addEventListener('message', onMessage)
  iframe.srcdoc = createIframeShellDocument({
    channelId,
    parentOrigin,
    importMap: {},
  })

  const dispose = () => {
    if (!active) {
      return
    }

    active = false
    window.removeEventListener('message', onMessage)
    if (readyWaiters.size > 0) {
      const disposeError = new Error(
        'Preview iframe bridge was disposed before readiness.',
      )
      for (const notifyDisposed of readyWaiters) {
        notifyDisposed(disposeError)
      }
      readyWaiters.clear()
    }
    if (pendingRender) {
      cleanupPendingRender(
        new Error('Preview iframe bridge disposed before render completed.'),
      )
    }
  }

  const render = async ({
    mode,
    entrySpecifier,
    entryDisplaySpecifier,
    entryExportName,
    importMap,
    cssText,
    userStyleSheets = [],
    hostPadding = '',
    backgroundColor = '',
    runtimeSpecifiers,
    timeoutMs = 12000,
  }) => {
    if (!active) {
      throw new Error('Preview iframe bridge is not active.')
    }

    if (pendingRender) {
      throw new Error('Preview iframe render already in flight.')
    }

    await waitForReady(timeoutMs)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRender = null
        emitTelemetry('timeout')
        reject(new Error('Workspace preview execution timed out.'))
      }, timeoutMs)

      pendingRender = {
        resolve: () => {
          resolve({
            iframe,
            dispose,
            render,
            updateBackgroundColor,
          })
        },
        reject,
        timer,
      }

      const stylePayload =
        Array.isArray(userStyleSheets) && userStyleSheets.length > 0
          ? { userStyleSheets }
          : { cssText }

      const payload = {
        mode,
        entrySpecifier,
        entryDisplaySpecifier,
        entryExportName,
        runtimeSpecifiers,
        ...stylePayload,
        hostPadding,
        backgroundColor,
        importMap,
        parentOrigin,
      }

      const sent = postMessageToIframe({
        type: previewProtocolMessageTypes.render,
        payload,
      })

      if (!sent) {
        clearTimeout(timer)
        pendingRender = null
        reject(new Error('Unable to initialize preview iframe document.'))
      }
    })
  }

  const updateBackgroundColor = nextColor => {
    postMessageToIframe({
      type: previewProtocolMessageTypes.configPatch,
      payload: {
        backgroundColor: typeof nextColor === 'string' ? nextColor : '',
      },
    })
  }

  return {
    target,
    iframe,
    dispose,
    render,
    updateBackgroundColor,
    isReady: () => ready,
  }
}
