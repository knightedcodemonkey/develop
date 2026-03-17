const ignoredTypeDiagnosticCodes = new Set([2318, 6053])

export const createTypeDiagnosticsController = ({
  cdnImports,
  importFromCdnWithFallback,
  getTypeScriptLibUrls,
  getJsxSource,
  defaultTypeScriptLibFileName = 'lib.esnext.full.d.ts',
  setTypecheckButtonLoading,
  setTypeDiagnosticsDetails,
  setStatus,
  setRenderedStatus,
  isRenderedStatus,
  isRenderedTypeErrorStatus,
  incrementTypeDiagnosticsRuns,
  decrementTypeDiagnosticsRuns,
  getActiveTypeDiagnosticsRuns,
}) => {
  let typeCheckRunId = 0
  let typeScriptCompiler = null
  let typeScriptCompilerProvider = null
  let typeScriptLibFiles = null
  let lastTypeErrorCount = 0
  let hasUnresolvedTypeErrors = false
  let scheduledTypeRecheck = null

  const clearTypeRecheckTimer = () => {
    if (!scheduledTypeRecheck) {
      return
    }

    clearTimeout(scheduledTypeRecheck)
    scheduledTypeRecheck = null
  }

  const flattenTypeDiagnosticMessage = (compiler, messageText) => {
    if (typeof compiler.flattenDiagnosticMessageText === 'function') {
      return compiler.flattenDiagnosticMessageText(messageText, '\n')
    }

    if (typeof messageText === 'string') {
      return messageText
    }

    if (messageText && typeof messageText.messageText === 'string') {
      return messageText.messageText
    }

    return 'Unknown TypeScript diagnostic'
  }

  const formatTypeDiagnostic = (compiler, diagnostic) => {
    const message = flattenTypeDiagnosticMessage(compiler, diagnostic.messageText)

    if (!diagnostic.file || typeof diagnostic.start !== 'number') {
      return `TS${diagnostic.code}: ${message}`
    }

    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    return `L${position.line + 1}:${position.character + 1} TS${diagnostic.code}: ${message}`
  }

  const ensureTypeScriptCompiler = async () => {
    if (typeScriptCompiler) {
      return typeScriptCompiler
    }

    try {
      const loaded = await importFromCdnWithFallback(cdnImports.typescript)
      typeScriptCompiler = loaded.module.default ?? loaded.module
      typeScriptCompilerProvider = loaded.provider ?? null

      if (typeof typeScriptCompiler.transpileModule !== 'function') {
        throw new Error(`transpileModule export was not found from ${loaded.url}`)
      }

      return typeScriptCompiler
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown TypeScript module loading failure'
      throw new Error(
        `Unable to load TypeScript diagnostics runtime from CDN: ${message}`,
        {
          cause: error,
        },
      )
    }
  }

  const shouldIgnoreTypeDiagnostic = diagnostic => {
    return ignoredTypeDiagnosticCodes.has(diagnostic.code)
  }

  const normalizeVirtualFileName = fileName =>
    typeof fileName === 'string' && fileName.startsWith('/')
      ? fileName.slice(1)
      : fileName

  const fetchTypeScriptLibText = async fileName => {
    const urls = getTypeScriptLibUrls(fileName, {
      typeScriptProvider: typeScriptCompilerProvider,
    })

    const attempts = urls.map(async url => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`)
      }

      return response.text()
    })

    try {
      return await Promise.any(attempts)
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error)

      if (error instanceof AggregateError) {
        const reasons = Array.from(error.errors ?? [])
          .slice(0, 3)
          .map(reason => (reason instanceof Error ? reason.message : String(reason)))
        const reasonSummary = reasons.length ? ` Causes: ${reasons.join(' | ')}` : ''

        message = `Tried URLs: ${urls.join(', ')}.${reasonSummary}`
      }

      throw new Error(`Unable to fetch TypeScript lib file ${fileName}: ${message}`, {
        cause: error,
      })
    }
  }

  const parseTypeScriptLibReferences = sourceText => {
    const references = new Set()
    const libReferencePattern = /\/\/\/\s*<reference\s+lib="([^"]+)"\s*\/>/g
    const pathReferencePattern = /\/\/\/\s*<reference\s+path="([^"]+)"\s*\/>/g

    for (const match of sourceText.matchAll(libReferencePattern)) {
      const libName = match[1]?.trim()
      if (libName) {
        references.add(`lib.${libName}.d.ts`)
      }
    }

    for (const match of sourceText.matchAll(pathReferencePattern)) {
      const pathName = match[1]?.trim()
      if (pathName) {
        references.add(pathName.replace(/^\.\//, ''))
      }
    }

    return [...references]
  }

  const hydrateTypeScriptLibFiles = async (pendingFileNames, loaded) => {
    const batch = [...new Set(pendingFileNames.map(normalizeVirtualFileName))].filter(
      fileName =>
        typeof fileName === 'string' && fileName.length > 0 && !loaded.has(fileName),
    )

    if (batch.length === 0) {
      return
    }

    const discoveredReferences = await Promise.all(
      batch.map(async fileName => {
        const sourceText = await fetchTypeScriptLibText(fileName)
        loaded.set(fileName, sourceText)
        return parseTypeScriptLibReferences(sourceText).map(normalizeVirtualFileName)
      }),
    )

    await hydrateTypeScriptLibFiles(discoveredReferences.flat(), loaded)
  }

  const ensureTypeScriptLibFiles = async () => {
    if (typeScriptLibFiles) {
      return typeScriptLibFiles
    }

    const loaded = new Map()
    await hydrateTypeScriptLibFiles([defaultTypeScriptLibFileName], loaded)
    typeScriptLibFiles = loaded
    return typeScriptLibFiles
  }

  const collectTypeDiagnostics = async (compiler, sourceText) => {
    const sourceFileName = 'component.tsx'
    const jsxTypesFileName = 'knighted-jsx-runtime.d.ts'
    const libFiles = await ensureTypeScriptLibFiles()
    const jsxTypes =
      'declare namespace React {\n' +
      '  type Key = string | number\n' +
      '  interface Attributes { key?: Key | null }\n' +
      '}\n' +
      'declare namespace JSX {\n' +
      '  type Element = unknown\n' +
      '  interface ElementChildrenAttribute { children: unknown }\n' +
      '  interface IntrinsicAttributes extends React.Attributes {}\n' +
      '  interface IntrinsicElements { [elemName: string]: Record<string, unknown> }\n' +
      '}\n'

    const files = new Map([
      [sourceFileName, sourceText],
      [jsxTypesFileName, jsxTypes],
      ...libFiles.entries(),
    ])

    const options = {
      jsx: compiler.JsxEmit?.Preserve,
      target: compiler.ScriptTarget?.ES2022,
      module: compiler.ModuleKind?.ESNext,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    }

    const host = {
      fileExists: fileName => files.has(normalizeVirtualFileName(fileName)),
      readFile: fileName => files.get(normalizeVirtualFileName(fileName)),
      getSourceFile: (fileName, languageVersion) => {
        const normalizedFileName = normalizeVirtualFileName(fileName)
        const text = files.get(normalizedFileName)
        if (typeof text !== 'string') {
          return undefined
        }

        const scriptKind = normalizedFileName.endsWith('.tsx')
          ? compiler.ScriptKind?.TSX
          : normalizedFileName.endsWith('.d.ts')
            ? compiler.ScriptKind?.TS
            : compiler.ScriptKind?.TS

        return compiler.createSourceFile(
          normalizedFileName,
          text,
          languageVersion,
          true,
          scriptKind,
        )
      },
      getDefaultLibFileName: () => defaultTypeScriptLibFileName,
      writeFile: () => {},
      getCurrentDirectory: () => '/',
      getDirectories: () => [],
      getCanonicalFileName: fileName => normalizeVirtualFileName(fileName),
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    }

    const program = compiler.createProgram({
      rootNames: [sourceFileName, jsxTypesFileName],
      options,
      host,
    })

    return compiler
      .getPreEmitDiagnostics(program)
      .filter(diagnostic => !shouldIgnoreTypeDiagnostic(diagnostic))
  }

  const runTypeDiagnostics = async runId => {
    incrementTypeDiagnosticsRuns()
    setTypecheckButtonLoading(true)

    setTypeDiagnosticsDetails({
      headline: 'Type checking…',
      level: 'muted',
    })

    try {
      const compiler = await ensureTypeScriptCompiler()
      if (runId !== typeCheckRunId) {
        return
      }

      const diagnostics = await collectTypeDiagnostics(compiler, getJsxSource())
      const errorCategory = compiler.DiagnosticCategory?.Error
      const errors = diagnostics.filter(
        diagnostic => diagnostic.category === errorCategory,
      )
      lastTypeErrorCount = errors.length
      hasUnresolvedTypeErrors = errors.length > 0
      clearTypeRecheckTimer()

      if (errors.length === 0) {
        setTypeDiagnosticsDetails({
          headline: 'No TypeScript errors found.',
          level: 'ok',
        })
      } else {
        setTypeDiagnosticsDetails({
          headline: `TypeScript found ${errors.length} error${errors.length === 1 ? '' : 's'}:`,
          lines: errors.map(diagnostic => formatTypeDiagnostic(compiler, diagnostic)),
          level: 'error',
        })
      }

      if (isRenderedStatus()) {
        setRenderedStatus()
      }
    } catch (error) {
      if (runId !== typeCheckRunId) {
        return
      }

      lastTypeErrorCount = 0
      hasUnresolvedTypeErrors = false
      clearTypeRecheckTimer()
      const message = error instanceof Error ? error.message : String(error)
      setTypeDiagnosticsDetails({
        headline: `Type diagnostics unavailable: ${message}`,
        level: 'error',
      })

      if (isRenderedTypeErrorStatus()) {
        setStatus('Rendered', 'neutral')
      }
    } finally {
      decrementTypeDiagnosticsRuns()
      setTypecheckButtonLoading(getActiveTypeDiagnosticsRuns() > 0)
    }
  }

  const triggerTypeDiagnostics = () => {
    typeCheckRunId += 1
    void runTypeDiagnostics(typeCheckRunId)
  }

  const scheduleTypeRecheck = () => {
    clearTypeRecheckTimer()

    if (!hasUnresolvedTypeErrors) {
      return
    }

    scheduledTypeRecheck = setTimeout(() => {
      scheduledTypeRecheck = null
      triggerTypeDiagnostics()
    }, 450)
  }

  const markTypeDiagnosticsStale = () => {
    if (hasUnresolvedTypeErrors) {
      setTypeDiagnosticsDetails({
        headline: 'Source changed. Re-checking type errors…',
        level: 'muted',
      })
      scheduleTypeRecheck()
      return
    }

    lastTypeErrorCount = 0
    setTypeDiagnosticsDetails({
      headline: 'Source changed. Click Typecheck to run diagnostics.',
      level: 'muted',
    })

    if (isRenderedTypeErrorStatus()) {
      setStatus('Rendered', 'neutral')
    }
  }

  const clearTypeDiagnosticsState = () => {
    lastTypeErrorCount = 0
    hasUnresolvedTypeErrors = false
    clearTypeRecheckTimer()
  }

  return {
    clearTypeDiagnosticsState,
    clearTypeRecheckTimer,
    getLastTypeErrorCount: () => lastTypeErrorCount,
    markTypeDiagnosticsStale,
    triggerTypeDiagnostics,
  }
}
