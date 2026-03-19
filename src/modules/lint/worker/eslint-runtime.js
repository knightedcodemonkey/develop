import { getEslintLintOptions } from '../eslint/config.js'
import { normalizeLintDiagnostic } from '../shared/format.js'
import { loadEslintRuntime } from './runtime-loader.js'

const toSeverity = value => {
  if (value === 2) return 'error'
  if (value === 1) return 'warning'
  return 'info'
}

export const runEslintLint = async ({ source, filename, renderMode }) => {
  if (source.trim().length === 0) {
    return []
  }

  const loaded = await loadEslintRuntime()
  const module = loaded.module

  const ESLintRuntime = module.ESLint ?? module.default?.ESLint ?? module.default
  if (typeof ESLintRuntime !== 'function') {
    throw new Error(`ESLint runtime API was not found from ${loaded.url}`)
  }

  const eslint = new ESLintRuntime(getEslintLintOptions({ renderMode }))
  const results = await eslint.lintText(source, {
    filePath: filename,
    warnIgnored: false,
  })
  const messages = results?.[0]?.messages ?? []

  return messages.map(message =>
    normalizeLintDiagnostic({
      engine: 'eslint',
      ruleId: message.ruleId ?? null,
      message: message.message,
      line: message.line,
      column: message.column,
      severity: toSeverity(message.severity),
    }),
  )
}
