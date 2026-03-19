import {
  isLintCancelMessage,
  isLintRequestMessage,
  lintEngines,
  lintWorkerMessageTypes,
} from './lint/shared/protocol.js'
import { runEslintLint } from './lint/worker/eslint-runtime.js'
import { runStylelintLint } from './lint/worker/stylelint-runtime.js'

const canceledIds = new Set()

const toErrorMessage = error => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return String(error)
}

const runEngineLint = async payload => {
  if (payload.engine === lintEngines.eslint) {
    return runEslintLint({
      source: payload.source,
      filename: payload.filename,
      renderMode: payload.mode ?? 'dom',
    })
  }

  if (payload.engine === lintEngines.stylelint) {
    return runStylelintLint({
      source: payload.source,
      filename: payload.filename,
      styleMode: payload.mode ?? 'css',
    })
  }

  throw new Error(`Unknown lint engine: ${payload.engine}`)
}

self.addEventListener('message', async event => {
  const message = event.data

  if (isLintCancelMessage(message)) {
    canceledIds.add(message.id)
    return
  }

  if (!isLintRequestMessage(message)) {
    return
  }

  const { id, payload } = message

  if (canceledIds.has(id)) {
    canceledIds.delete(id)
    return
  }

  try {
    const diagnostics = await runEngineLint(payload)

    if (canceledIds.has(id)) {
      canceledIds.delete(id)
      return
    }

    self.postMessage({
      type: lintWorkerMessageTypes.result,
      id,
      diagnostics,
    })
  } catch (error) {
    if (canceledIds.has(id)) {
      canceledIds.delete(id)
      return
    }

    self.postMessage({
      type: lintWorkerMessageTypes.error,
      id,
      message: toErrorMessage(error),
    })
  }
})
