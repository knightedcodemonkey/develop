import {
  isLintErrorMessage,
  isLintResultMessage,
  lintWorkerMessageTypes,
} from './protocol.js'

const createAbortError = message => {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export const createLintWorkerClient = ({ worker, timeoutMs = 12000 }) => {
  let sequence = 0
  const pending = new Map()

  const settle = ({ id, resolver, value }) => {
    const entry = pending.get(id)
    if (!entry) return
    clearTimeout(entry.timeout)
    pending.delete(id)
    resolver(value)
  }

  worker.addEventListener('message', event => {
    const message = event.data

    if (isLintResultMessage(message)) {
      settle({
        id: message.id,
        resolver: pending.get(message.id)?.resolve,
        value: message.diagnostics,
      })
      return
    }

    if (isLintErrorMessage(message)) {
      settle({
        id: message.id,
        resolver: pending.get(message.id)?.reject,
        value: new Error(message.message),
      })
    }
  })

  const run = (requestMessage, { signal } = {}) => {
    const id = `lint-${Date.now()}-${++sequence}`
    const message = {
      ...requestMessage,
      id,
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id)
        worker.postMessage({
          type: lintWorkerMessageTypes.cancel,
          id,
        })
        reject(new Error(`Lint request timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      pending.set(id, { resolve, reject, timeout })

      if (signal) {
        const handleAbort = () => {
          if (!pending.has(id)) return
          clearTimeout(timeout)
          pending.delete(id)
          worker.postMessage({
            type: lintWorkerMessageTypes.cancel,
            id,
          })
          reject(createAbortError('Lint request was aborted'))
        }

        if (signal.aborted) {
          handleAbort()
          return
        }

        signal.addEventListener('abort', handleAbort, { once: true })
      }

      worker.postMessage(message)
    })
  }

  const dispose = () => {
    for (const [id, entry] of pending.entries()) {
      clearTimeout(entry.timeout)
      entry.reject(new Error('Lint worker client disposed'))
      pending.delete(id)
    }

    worker.terminate()
  }

  return {
    run,
    dispose,
  }
}
