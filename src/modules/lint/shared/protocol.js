export const lintEngines = Object.freeze({
  eslint: 'eslint',
  stylelint: 'stylelint',
})

export const lintScopes = Object.freeze({
  component: 'component',
  styles: 'styles',
})

export const lintWorkerMessageTypes = Object.freeze({
  request: 'lint-request',
  cancel: 'lint-cancel',
  result: 'lint-result',
  error: 'lint-error',
})

export const createLintRequest = ({ id, engine, scope, source, filename, mode }) => ({
  type: lintWorkerMessageTypes.request,
  id,
  payload: {
    engine,
    scope,
    source,
    filename,
    mode,
  },
})

const isRecord = value => typeof value === 'object' && value !== null

export const isLintResultMessage = value => {
  if (!isRecord(value)) return false
  if (value.type !== lintWorkerMessageTypes.result) return false
  if (typeof value.id !== 'string') return false
  return Array.isArray(value.diagnostics)
}

export const isLintErrorMessage = value => {
  if (!isRecord(value)) return false
  if (value.type !== lintWorkerMessageTypes.error) return false
  if (typeof value.id !== 'string') return false
  return typeof value.message === 'string'
}

export const isLintRequestMessage = value => {
  if (!isRecord(value)) return false
  if (value.type !== lintWorkerMessageTypes.request) return false
  if (typeof value.id !== 'string') return false
  if (!isRecord(value.payload)) return false
  const { engine, scope, source, filename, mode } = value.payload
  return (
    typeof engine === 'string' &&
    typeof scope === 'string' &&
    typeof source === 'string' &&
    typeof filename === 'string' &&
    (typeof mode === 'string' || mode === null || typeof mode === 'undefined')
  )
}

export const isLintCancelMessage = value => {
  if (!isRecord(value)) return false
  if (value.type !== lintWorkerMessageTypes.cancel) return false
  return typeof value.id === 'string'
}
