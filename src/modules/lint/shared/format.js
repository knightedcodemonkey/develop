const normalizeSeverity = value => {
  if (value === 'error' || value === 2) return 'error'
  if (value === 'warning' || value === 1) return 'warning'
  return 'info'
}

export const normalizeLintDiagnostic = diagnostic => {
  const line = Number.isFinite(diagnostic?.line) ? Number(diagnostic.line) : null
  const column = Number.isFinite(diagnostic?.column) ? Number(diagnostic.column) : null
  const message =
    typeof diagnostic?.message === 'string' && diagnostic.message.trim().length > 0
      ? diagnostic.message.trim()
      : 'Unknown lint diagnostic'

  return {
    engine: typeof diagnostic?.engine === 'string' ? diagnostic.engine : 'lint',
    ruleId: typeof diagnostic?.ruleId === 'string' ? diagnostic.ruleId : null,
    message,
    severity: normalizeSeverity(diagnostic?.severity),
    line,
    column,
  }
}

export const formatLintDiagnosticLine = diagnostic => {
  const normalized = normalizeLintDiagnostic(diagnostic)
  const linePrefix =
    normalized.line && normalized.column
      ? `L${normalized.line}:${normalized.column}`
      : normalized.line
        ? `L${normalized.line}`
        : null

  const ruleSuffix = normalized.ruleId ? ` (${normalized.ruleId})` : ''
  if (!linePrefix) {
    return `${normalized.message}${ruleSuffix}`
  }

  return `${linePrefix} ${normalized.message}${ruleSuffix}`
}

export const createLintDiagnosticsSummary = ({
  diagnostics,
  okHeadline,
  errorHeadline,
}) => {
  const normalized = diagnostics.map(normalizeLintDiagnostic)
  if (normalized.length === 0) {
    return {
      headline: okHeadline,
      lines: [],
      level: 'ok',
    }
  }

  return {
    headline: errorHeadline,
    lines: normalized.map(formatLintDiagnosticLine),
    level: normalized.some(item => item.severity === 'error') ? 'error' : 'muted',
  }
}
