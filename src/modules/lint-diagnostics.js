const biomeConfiguration = {
  assist: {
    enabled: false,
  },
  formatter: {
    enabled: false,
  },
  linter: {
    enabled: true,
    rules: {
      recommended: true,
    },
  },
}

const lintPathByScope = {
  component: '/component.tsx',
  styles: '/styles.css',
  stylesModule: '/styles.module.css',
  stylesSass: '/styles.scss',
}

const allowedUnusedComponentBindings = new Set(['App', 'View', 'render'])

const normalizeSeverity = value => {
  if (value === 'error' || value === 2) return 'error'
  if (value === 'warning' || value === 1) return 'warning'
  return 'info'
}

const normalizeLintDiagnostic = diagnostic => {
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

const formatLintDiagnosticLine = diagnostic => {
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

const buildLintDiagnosticsSummary = ({ diagnostics, okHeadline, errorHeadline }) => {
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
    level: 'error',
  }
}

const normalizeLintRuleId = category => {
  if (typeof category !== 'string' || category.length === 0) {
    return null
  }

  if (category.startsWith('lint/')) {
    return category.slice(5)
  }

  return category
}

const normalizeLintMessage = markup => {
  if (!Array.isArray(markup)) {
    return 'Unknown lint diagnostic'
  }

  const message = markup
    .map(node => (typeof node?.content === 'string' ? node.content : ''))
    .join('')
    .trim()

  return message.length > 0 ? message : 'Unknown lint diagnostic'
}

const normalizeLintSeverity = severity => {
  if (severity === 'fatal' || severity === 'error') {
    return 2
  }

  if (severity === 'warning') {
    return 1
  }

  return 0
}

const getLineAndColumnFromOffset = (source, offset) => {
  if (!Number.isInteger(offset) || offset < 0) {
    return { line: null, column: null }
  }

  const limit = Math.min(offset, source.length)
  let line = 1
  let column = 1

  for (let index = 0; index < limit; index += 1) {
    if (source[index] === '\n') {
      line += 1
      column = 1
      continue
    }

    column += 1
  }

  return { line, column }
}

const getIdentifierAtOffset = (source, offset) => {
  if (!Number.isInteger(offset) || offset < 0 || offset >= source.length) {
    return null
  }

  const tail = source.slice(offset)
  const declarationMatch = tail.match(
    /^(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/,
  )
  if (declarationMatch) {
    return declarationMatch[1]
  }

  const identifierMatch = tail.match(/^[A-Za-z_$][\w$]*/)
  return identifierMatch ? identifierMatch[0] : null
}

const normalizeBiomeLintDiagnostics = ({ source, diagnostics }) =>
  diagnostics
    .filter(diagnostic => {
      if (diagnostic?.category !== 'lint/correctness/noUnusedVariables') {
        return true
      }

      const startOffset = Array.isArray(diagnostic?.location?.span)
        ? diagnostic.location.span[0]
        : null

      const identifierAtSpan = getIdentifierAtOffset(source, startOffset)
      if (identifierAtSpan && allowedUnusedComponentBindings.has(identifierAtSpan)) {
        return false
      }

      const message = normalizeLintMessage(diagnostic?.message)
      const match = message.match(/[`'"]?([A-Za-z_$][\w$]*)[`'"]? is unused\./)

      if (!match) {
        return true
      }

      return !allowedUnusedComponentBindings.has(match[1])
    })
    .map(diagnostic => {
      const startOffset = Array.isArray(diagnostic?.location?.span)
        ? diagnostic.location.span[0]
        : null

      const position = getLineAndColumnFromOffset(source, startOffset)

      return {
        engine: 'biome',
        ruleId: normalizeLintRuleId(diagnostic?.category),
        message: normalizeLintMessage(diagnostic?.message),
        severity: normalizeLintSeverity(diagnostic?.severity),
        line: position.line,
        column: position.column,
      }
    })

const isAbortError = error =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'

const throwIfAborted = signal => {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

export const createLintDiagnosticsController = ({
  cdnImports,
  importFromCdnWithFallback,
  getComponentSource,
  getStylesSource,
  getStyleMode,
  setComponentDiagnostics,
  setStyleDiagnostics,
  setStatus,
}) => {
  let biomeWorkspacePromise = null
  let componentLintRunId = 0
  let stylesLintRunId = 0

  const initializeBiomeWorkspace = async () => {
    const loaded = await importFromCdnWithFallback(cdnImports.biomeWasmWeb)
    const module = loaded.module

    if (
      typeof module?.default !== 'function' ||
      typeof module?.Workspace !== 'function'
    ) {
      throw new Error('Unexpected @biomejs/wasm-web module shape from CDN.')
    }

    await module.default()

    const workspace = new module.Workspace()
    const opened = workspace.openProject({
      openUninitialized: true,
      path: '/',
    })

    workspace.updateSettings({
      configuration: biomeConfiguration,
      projectKey: opened.projectKey,
    })

    return {
      workspace,
      projectKey: opened.projectKey,
    }
  }

  const ensureBiomeWorkspace = async () => {
    if (!biomeWorkspacePromise) {
      biomeWorkspacePromise = initializeBiomeWorkspace().catch(error => {
        biomeWorkspacePromise = null
        throw error
      })
    }

    return biomeWorkspacePromise
  }

  const runLintDiagnostics = async ({ source, path, signal }) => {
    throwIfAborted(signal)

    const session = await ensureBiomeWorkspace()
    throwIfAborted(signal)

    const { workspace, projectKey } = session

    workspace.openFile({
      path,
      projectKey,
      content: {
        type: 'fromClient',
        content: source,
        version: 1,
      },
    })

    try {
      const result = workspace.pullDiagnostics({
        categories: ['lint'],
        path,
        projectKey,
        pullCodeActions: false,
      })

      throwIfAborted(signal)

      return normalizeBiomeLintDiagnostics({
        source,
        diagnostics: result.diagnostics,
      })
    } finally {
      workspace.closeFile({
        path,
        projectKey,
      })
    }
  }

  const lintComponent = async ({ signal } = {}) => {
    componentLintRunId += 1
    const runId = componentLintRunId

    setComponentDiagnostics({
      headline: 'Running Biome diagnostics...',
      lines: [],
      level: 'muted',
    })
    setStatus('Linting component with Biome...', 'pending')

    try {
      const diagnostics = await runLintDiagnostics({
        source: getComponentSource(),
        path: lintPathByScope.component,
        signal,
      })

      if (runId !== componentLintRunId) {
        return null
      }

      const summary = buildLintDiagnosticsSummary({
        diagnostics,
        okHeadline: 'No Biome issues found.',
        errorHeadline: 'Biome reported issues.',
      })

      setComponentDiagnostics(summary)
      setStatus(
        summary.level === 'error'
          ? `Rendered (Lint issues: ${summary.lines.length})`
          : 'Rendered',
        summary.level === 'error' ? 'error' : 'neutral',
      )
      return {
        issueCount: summary.lines.length,
      }
    } catch (error) {
      if (runId !== componentLintRunId) {
        return null
      }

      if (isAbortError(error)) {
        return null
      }

      const message = error instanceof Error ? error.message : String(error)
      setComponentDiagnostics({
        headline: `Biome unavailable: ${message}`,
        lines: [],
        level: 'error',
      })
      setStatus('Component lint unavailable', 'error')
      return {
        issueCount: 0,
      }
    }
  }

  const lintStyles = async ({ signal } = {}) => {
    stylesLintRunId += 1
    const runId = stylesLintRunId

    setStyleDiagnostics({
      headline: 'Running Biome diagnostics...',
      lines: [],
      level: 'muted',
    })
    setStatus('Linting styles with Biome...', 'pending')

    try {
      const styleMode = getStyleMode()
      if (styleMode === 'less') {
        throw new Error('Biome CSS lint does not currently support Less syntax.')
      }

      const path =
        styleMode === 'sass'
          ? lintPathByScope.stylesSass
          : styleMode === 'module'
            ? lintPathByScope.stylesModule
            : lintPathByScope.styles

      const diagnostics = await runLintDiagnostics({
        source: getStylesSource(),
        path,
        signal,
      })

      if (runId !== stylesLintRunId) {
        return null
      }

      const summary = buildLintDiagnosticsSummary({
        diagnostics,
        okHeadline: 'No Biome issues found.',
        errorHeadline: 'Biome reported issues.',
      })

      setStyleDiagnostics(summary)
      setStatus(
        summary.level === 'error'
          ? `Rendered (Lint issues: ${summary.lines.length})`
          : 'Rendered',
        summary.level === 'error' ? 'error' : 'neutral',
      )
      return {
        issueCount: summary.lines.length,
      }
    } catch (error) {
      if (runId !== stylesLintRunId) {
        return null
      }

      if (isAbortError(error)) {
        return null
      }

      const message = error instanceof Error ? error.message : String(error)
      setStyleDiagnostics({
        headline: `Biome unavailable: ${message}`,
        lines: [],
        level: 'error',
      })
      setStatus('Styles lint unavailable', 'error')
      return {
        issueCount: 0,
      }
    }
  }

  const cancelAll = () => {
    componentLintRunId += 1
    stylesLintRunId += 1
  }

  const dispose = () => {}

  return {
    cancelAll,
    lintComponent,
    lintStyles,
    dispose,
  }
}
