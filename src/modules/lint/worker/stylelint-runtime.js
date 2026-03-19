import { getStylelintLintOptions } from '../stylelint/config.js'
import { normalizeLintDiagnostic } from '../shared/format.js'
import { loadStylelintRuntime } from './runtime-loader.js'

const toSeverity = value => (value === 'error' ? 'error' : 'warning')

export const runStylelintLint = async ({ source, filename, styleMode }) => {
  if (source.trim().length === 0) {
    return []
  }

  const loaded = await loadStylelintRuntime()
  const stylelint = loaded.module.default ?? loaded.module
  if (!stylelint || typeof stylelint.lint !== 'function') {
    throw new Error(`Stylelint runtime API was not found from ${loaded.url}`)
  }

  const result = await stylelint.lint(
    getStylelintLintOptions({
      source,
      filename,
      dialect: styleMode,
    }),
  )

  const firstResult = result?.results?.[0]
  const warnings = firstResult?.warnings ?? []

  return warnings.map(warning =>
    normalizeLintDiagnostic({
      engine: 'stylelint',
      ruleId: warning.rule,
      message: warning.text,
      line: warning.line,
      column: warning.column,
      severity: toSeverity(warning.severity),
    }),
  )
}
