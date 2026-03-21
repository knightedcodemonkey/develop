const ignoredTypeDiagnosticCodes = new Set([2318, 6053])
const reactTypeRootPackages = ['@types/react', '@types/react-dom']
const typeImportPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"\n]*?\s+from\s+)?['"]([^'"\n]+)['"]|import\(['"]([^'"\n]+)['"]\)/g
const typeReferencePathPattern = /\/\/\/\s*<reference\s+path="([^"]+)"\s*\/>/g
const typeReferenceTypesPattern = /\/\/\/\s*<reference\s+types="([^"]+)"\s*\/>/g

const isTypeDeclarationPathReference = reference => {
  if (typeof reference !== 'string') {
    return false
  }

  return reference.endsWith('.d.ts') || reference.endsWith('.ts')
}

const isAbsoluteUrlReference = reference => {
  if (typeof reference !== 'string') {
    return false
  }

  return /^(https?:)?\/\//.test(reference)
}

const domJsxTypes =
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

const normalizeVirtualFileName = fileName =>
  typeof fileName === 'string' && fileName.startsWith('/') ? fileName.slice(1) : fileName

const normalizeRelativePath = path => {
  const normalized = String(path ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
  const parts = normalized.split('/')
  const resolved = []

  for (const part of parts) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      resolved.pop()
      continue
    }
    resolved.push(part)
  }

  return resolved.join('/')
}

const dirname = path => {
  const normalized = normalizeRelativePath(path)
  const lastSlashIndex = normalized.lastIndexOf('/')
  return lastSlashIndex === -1 ? '' : normalized.slice(0, lastSlashIndex)
}

const joinPath = (...segments) =>
  normalizeRelativePath(segments.filter(Boolean).join('/'))

const toDtsPathCandidates = path => {
  const normalized = normalizeRelativePath(path)
  if (!normalized) {
    return []
  }

  if (normalized.endsWith('.d.ts')) {
    return [normalized]
  }

  const withDtsFromScriptExt = normalized.replace(/\.(c|m)?[jt]sx?$/, '.d.ts')

  return [
    `${normalized}.d.ts`,
    withDtsFromScriptExt,
    `${normalized}/index.d.ts`,
    normalized,
  ].filter((candidate, index, all) => candidate && all.indexOf(candidate) === index)
}

const splitBareSpecifier = specifier => {
  if (typeof specifier !== 'string' || specifier.length === 0) {
    return null
  }

  if (specifier.startsWith('@')) {
    const [scope, name, ...rest] = specifier.split('/')
    if (!scope || !name) {
      return null
    }
    return {
      packageName: `${scope}/${name}`,
      subpath: rest.join('/'),
    }
  }

  const [name, ...rest] = specifier.split('/')
  return {
    packageName: name,
    subpath: rest.join('/'),
  }
}

const toTypePackageName = runtimePackageName => {
  if (runtimePackageName === 'csstype') {
    return 'csstype'
  }
  if (runtimePackageName === 'prop-types') {
    return '@types/prop-types'
  }
  if (runtimePackageName === 'scheduler') {
    return '@types/scheduler'
  }
  if (runtimePackageName.startsWith('@types/')) {
    return runtimePackageName
  }
  if (runtimePackageName.startsWith('@')) {
    return `@types/${runtimePackageName.slice(1).replace('/', '__')}`
  }
  return `@types/${runtimePackageName}`
}

const parseTypeReferencesWithRegexFallback = sourceText => {
  const references = new Set()
  const sourceWithoutComments = sourceText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

  for (const match of sourceWithoutComments.matchAll(typeImportPattern)) {
    const specifier = (match[1] ?? match[2] ?? '').trim()
    if (specifier) {
      references.add(specifier)
    }
  }

  for (const match of sourceText.matchAll(typeReferencePathPattern)) {
    const path = match[1]?.trim()
    if (path) {
      references.add(path)
    }
  }

  for (const match of sourceText.matchAll(typeReferenceTypesPattern)) {
    const packageName = match[1]?.trim()
    if (packageName) {
      references.add(packageName)
    }
  }

  return [...references]
}

const parseTypeReferences = (compiler, sourceText) => {
  if (typeof compiler.preProcessFile === 'function') {
    const references = new Set()
    const preProcessed = compiler.preProcessFile(sourceText, true, true)

    for (const importedFile of preProcessed.importedFiles ?? []) {
      const fileName = importedFile.fileName?.trim()
      if (fileName) {
        references.add(fileName)
      }
    }

    for (const referencedFile of preProcessed.referencedFiles ?? []) {
      const fileName = referencedFile.fileName?.trim()
      if (fileName) {
        references.add(fileName)
      }
    }

    for (const typeDirective of preProcessed.typeReferenceDirectives ?? []) {
      const fileName = typeDirective.fileName?.trim()
      if (fileName) {
        references.add(fileName)
      }
    }

    return [...references]
  }

  return parseTypeReferencesWithRegexFallback(sourceText)
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

export const createTypeDiagnosticsController = ({
  cdnImports,
  importFromCdnWithFallback,
  getTypeScriptLibUrls,
  getTypePackageFileUrls,
  getJsxSource,
  getRenderMode = () => 'dom',
  defaultTypeScriptLibFileName = 'lib.esnext.full.d.ts',
  setTypecheckButtonLoading,
  setTypeDiagnosticsDetails,
  setTypeDiagnosticsPending = () => {},
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
  let reactTypeFiles = null
  let reactTypePackageEntries = null
  let reactTypeLoadPromise = null
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
    const code = Number.isFinite(diagnostic.code) ? `TS${diagnostic.code}` : 'TS'
    const formattedMessage = `${code}: ${message}`

    if (!diagnostic.file || typeof diagnostic.start !== 'number') {
      return {
        message: formattedMessage,
      }
    }

    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    return {
      line: position.line + 1,
      column: position.character + 1,
      message: formattedMessage,
    }
  }

  const fetchTextFromUrls = async (
    urls,
    errorPrefix,
    { orderedFallback = false } = {},
  ) => {
    if (orderedFallback) {
      const tryUrlAt = async (index, failures = []) => {
        if (index >= urls.length) {
          const reasons = failures
            .slice(0, 3)
            .map(reason => (reason instanceof Error ? reason.message : String(reason)))
          const reasonSummary = reasons.length ? ` Causes: ${reasons.join(' | ')}` : ''

          throw new Error(
            `${errorPrefix}: Tried URLs: ${urls.join(', ')}.${reasonSummary}`,
            {
              cause: failures.at(-1),
            },
          )
        }

        const url = urls[index]

        try {
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} from ${url}`)
          }

          return response.text()
        } catch (error) {
          return tryUrlAt(index + 1, [...failures, error])
        }
      }

      return tryUrlAt(0)
    }

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

      throw new Error(`${errorPrefix}: ${message}`, {
        cause: error,
      })
    }
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

  const fetchTypeScriptLibText = async fileName => {
    const urls = getTypeScriptLibUrls(fileName, {
      typeScriptProvider: typeScriptCompilerProvider,
    })
    return fetchTextFromUrls(urls, `Unable to fetch TypeScript lib file ${fileName}`)
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

  const getTypePackageManifestUrls = packageName => {
    return getTypePackageFileUrls(packageName, 'package.json', {
      typeScriptProvider: typeScriptCompilerProvider,
    })
  }

  const getTypePackageFileUrlsWithProvider = (packageName, fileName) => {
    return getTypePackageFileUrls(packageName, fileName, {
      typeScriptProvider: typeScriptCompilerProvider,
    })
  }

  const fetchTypePackageDeclaration = async (packageName, requestedFileName) => {
    const fileNameCandidates = toDtsPathCandidates(requestedFileName)

    const tryCandidateAt = async (index, firstError = null) => {
      if (index >= fileNameCandidates.length) {
        throw new Error(
          `Unable to fetch type declaration ${packageName}/${requestedFileName}. Tried candidates: ${fileNameCandidates.join(', ')}.${firstError ? ` ${firstError}` : ''}`,
        )
      }

      const candidateFileName = fileNameCandidates[index]

      try {
        const sourceText = await fetchTextFromUrls(
          getTypePackageFileUrlsWithProvider(packageName, candidateFileName),
          `Unable to fetch type declaration ${packageName}/${candidateFileName}`,
          {
            orderedFallback: true,
          },
        )

        return {
          fileName: candidateFileName,
          sourceText,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return tryCandidateAt(index + 1, firstError ?? message)
      }
    }

    return tryCandidateAt(0)
  }

  const ensureReactTypeFiles = async compiler => {
    if (reactTypeFiles && reactTypePackageEntries) {
      return {
        files: reactTypeFiles,
        packageEntries: reactTypePackageEntries,
      }
    }

    if (reactTypeLoadPromise) {
      return reactTypeLoadPromise
    }

    reactTypeLoadPromise = (async () => {
      const files = new Map()
      const packageEntryByName = new Map()
      const packageManifestByName = new Map()
      const pending = []
      const visited = new Set()

      const getVirtualTypeFileName = (packageName, packageFileName) => {
        return joinPath('node_modules', packageName, packageFileName)
      }

      const enqueueTypeFile = (packageName, fileName) => {
        for (const candidate of toDtsPathCandidates(fileName)) {
          const key = `${packageName}:${candidate}`
          if (visited.has(key)) {
            continue
          }
          visited.add(key)
          pending.push({ packageName, fileName: candidate })
        }
      }

      const ensureTypePackageManifest = async packageName => {
        if (packageManifestByName.has(packageName)) {
          return packageManifestByName.get(packageName)
        }

        const manifestText = await fetchTextFromUrls(
          getTypePackageManifestUrls(packageName),
          `Unable to fetch type package manifest ${packageName}`,
          {
            orderedFallback: true,
          },
        )
        const manifest = JSON.parse(manifestText)
        packageManifestByName.set(packageName, manifest)

        const entry =
          typeof manifest.types === 'string'
            ? manifest.types
            : typeof manifest.typings === 'string'
              ? manifest.typings
              : 'index.d.ts'

        packageEntryByName.set(packageName, normalizeRelativePath(entry))
        enqueueTypeFile(packageName, entry)

        const dependencies = {
          ...(manifest.dependencies ?? {}),
          ...(manifest.peerDependencies ?? {}),
        }

        await Promise.all(
          Object.keys(dependencies).map(dependencyName => {
            const dependencyPackageName = toTypePackageName(dependencyName)
            return ensureTypePackageManifest(dependencyPackageName)
          }),
        )

        return manifest
      }

      await Promise.all(
        reactTypeRootPackages.map(packageName => ensureTypePackageManifest(packageName)),
      )

      const drainPendingTypeFiles = async () => {
        const next = pending.shift()
        if (!next) {
          return
        }

        const { packageName, fileName } = next
        const primaryVirtualFileName = getVirtualTypeFileName(packageName, fileName)

        if (files.has(primaryVirtualFileName)) {
          await drainPendingTypeFiles()
          return
        }

        const fetched = await fetchTypePackageDeclaration(packageName, fileName)
        const resolvedVirtualFileName = getVirtualTypeFileName(
          packageName,
          fetched.fileName,
        )

        files.set(primaryVirtualFileName, fetched.sourceText)
        if (resolvedVirtualFileName !== primaryVirtualFileName) {
          files.set(resolvedVirtualFileName, fetched.sourceText)
        }

        const references = parseTypeReferences(compiler, fetched.sourceText)
        const pendingPackageManifestLoads = []

        for (const reference of references) {
          if (!reference || reference.startsWith('node:')) {
            continue
          }

          if (isAbsoluteUrlReference(reference)) {
            continue
          }

          if (reference.startsWith('.') || isTypeDeclarationPathReference(reference)) {
            const relativeBase = dirname(fileName)
            enqueueTypeFile(packageName, joinPath(relativeBase, reference))
            continue
          }

          const parsedReference = splitBareSpecifier(reference)
          if (!parsedReference) {
            continue
          }

          const targetPackageName = toTypePackageName(parsedReference.packageName)
          pendingPackageManifestLoads.push(
            ensureTypePackageManifest(targetPackageName).then(() => {
              const targetSubpath = normalizeRelativePath(parsedReference.subpath)
              if (targetSubpath) {
                enqueueTypeFile(targetPackageName, targetSubpath)
                return
              }

              const targetEntry = packageEntryByName.get(targetPackageName)
              if (targetEntry) {
                enqueueTypeFile(targetPackageName, targetEntry)
              }
            }),
          )
        }

        if (pendingPackageManifestLoads.length > 0) {
          await Promise.all(pendingPackageManifestLoads)
        }

        await drainPendingTypeFiles()
      }

      await drainPendingTypeFiles()

      reactTypeFiles = files
      reactTypePackageEntries = packageEntryByName
      reactTypeLoadPromise = null

      return {
        files,
        packageEntries: packageEntryByName,
      }
    })()

    try {
      return await reactTypeLoadPromise
    } catch (error) {
      reactTypeLoadPromise = null
      throw error
    }
  }

  const toVirtualTypeFileCandidates = (
    packageEntries,
    runtimeSpecifier,
    containingFile,
  ) => {
    if (runtimeSpecifier.startsWith('.')) {
      const containingDirectory = dirname(containingFile)
      return toDtsPathCandidates(joinPath(containingDirectory, runtimeSpecifier))
    }

    const parsedSpecifier = splitBareSpecifier(runtimeSpecifier)
    if (!parsedSpecifier) {
      return []
    }

    const packageName = toTypePackageName(parsedSpecifier.packageName)
    const subpath = normalizeRelativePath(parsedSpecifier.subpath)
    if (!subpath) {
      const packageEntry = packageEntries.get(packageName)
      if (!packageEntry) {
        return []
      }
      return [joinPath('node_modules', packageName, packageEntry)]
    }

    return toDtsPathCandidates(subpath).map(candidate =>
      joinPath('node_modules', packageName, candidate),
    )
  }

  const collectTypeDiagnostics = async (compiler, sourceText) => {
    const sourceFileName = 'component.tsx'
    const jsxTypesFileName = 'knighted-jsx-runtime.d.ts'
    const renderMode = getRenderMode()
    const isReactMode = renderMode === 'react'
    const libFiles = await ensureTypeScriptLibFiles()

    let reactTypes = null
    if (isReactMode) {
      reactTypes = await ensureReactTypeFiles(compiler)
    }

    const files = new Map([[sourceFileName, sourceText], ...libFiles.entries()])

    if (!isReactMode) {
      files.set(jsxTypesFileName, domJsxTypes)
    }

    if (reactTypes) {
      for (const [fileName, text] of reactTypes.files.entries()) {
        files.set(fileName, text)
      }
    }

    const options = {
      jsx: compiler.JsxEmit?.Preserve,
      target: compiler.ScriptTarget?.ES2022,
      module: compiler.ModuleKind?.ESNext,
      moduleResolution:
        compiler.ModuleResolutionKind?.Bundler ??
        compiler.ModuleResolutionKind?.NodeNext ??
        compiler.ModuleResolutionKind?.NodeJs,
      types: [],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    }

    const listVirtualDirectories = targetDirectory => {
      const normalizedDirectory = normalizeRelativePath(targetDirectory)
      const prefix = normalizedDirectory ? `${normalizedDirectory}/` : ''
      const nextDirectories = new Set()

      for (const fileName of files.keys()) {
        const normalizedFileName = normalizeRelativePath(fileName)
        if (!normalizedFileName.startsWith(prefix)) {
          continue
        }

        const remainder = normalizedFileName.slice(prefix.length)
        const nextSegment = remainder.split('/')[0]
        if (nextSegment && remainder.includes('/')) {
          nextDirectories.add(nextSegment)
        }
      }

      return [...nextDirectories]
    }

    const moduleResolutionHost = {
      fileExists: fileName => files.has(normalizeVirtualFileName(fileName)),
      readFile: fileName => files.get(normalizeVirtualFileName(fileName)),
      directoryExists: directoryName => {
        const normalized = normalizeRelativePath(normalizeVirtualFileName(directoryName))
        return listVirtualDirectories(normalized).length > 0
      },
      getDirectories: directoryName => {
        const normalized = normalizeRelativePath(normalizeVirtualFileName(directoryName))
        return listVirtualDirectories(normalized)
      },
      realpath: fileName => normalizeVirtualFileName(fileName),
      getCurrentDirectory: () => '/',
    }

    const resolveModuleNames = (moduleNames, containingFile) => {
      return moduleNames.map(moduleName => {
        const resolved = compiler.resolveModuleName(
          moduleName,
          containingFile,
          options,
          moduleResolutionHost,
        )

        if (resolved.resolvedModule) {
          return resolved.resolvedModule
        }

        if (!reactTypes) {
          return undefined
        }

        const candidates = toVirtualTypeFileCandidates(
          reactTypes.packageEntries,
          moduleName,
          containingFile,
        )

        const matched = candidates.find(candidate => files.has(candidate))
        if (!matched) {
          return undefined
        }

        return {
          resolvedFileName: matched,
          extension: compiler.Extension?.Dts ?? '.d.ts',
          isExternalLibraryImport: matched.startsWith('node_modules/'),
        }
      })
    }

    const host = {
      fileExists: moduleResolutionHost.fileExists,
      readFile: moduleResolutionHost.readFile,
      directoryExists: moduleResolutionHost.directoryExists,
      getDirectories: moduleResolutionHost.getDirectories,
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
      getCanonicalFileName: fileName => normalizeVirtualFileName(fileName),
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      resolveModuleNames,
    }

    const rootNames = [sourceFileName]
    if (!isReactMode) {
      rootNames.push(jsxTypesFileName)
    }
    if (reactTypes) {
      for (const packageName of reactTypeRootPackages) {
        const packageEntry = reactTypes.packageEntries.get(packageName)
        if (!packageEntry) {
          continue
        }
        rootNames.push(joinPath('node_modules', packageName, packageEntry))
      }
    }

    const program = compiler.createProgram({
      rootNames,
      options,
      host,
    })

    return compiler
      .getPreEmitDiagnostics(program)
      .filter(diagnostic => !shouldIgnoreTypeDiagnostic(diagnostic))
  }

  const runTypeDiagnostics = async runId => {
    incrementTypeDiagnosticsRuns()
    setTypeDiagnosticsPending(false)
    setTypecheckButtonLoading(true)
    setStatus('Type checking component...', 'pending')

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
        setStatus('Rendered', 'neutral')
      } else {
        setTypeDiagnosticsDetails({
          headline: `TypeScript found ${errors.length} error${errors.length === 1 ? '' : 's'}:`,
          lines: errors.map(diagnostic => formatTypeDiagnostic(compiler, diagnostic)),
          level: 'error',
        })
        setStatus(`Rendered (Type errors: ${errors.length})`, 'error')
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
      setStatus('Type diagnostics unavailable', 'error')

      if (isRenderedTypeErrorStatus()) {
        setStatus('Rendered', 'neutral')
      }
    } finally {
      if (runId === typeCheckRunId) {
        setTypeDiagnosticsPending(false)
      }
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
      setTypeDiagnosticsPending(true)
      setTypeDiagnosticsDetails({
        headline: 'Source changed. Re-checking type errors…',
        level: 'muted',
      })
      scheduleTypeRecheck()
      return
    }

    lastTypeErrorCount = 0
    setTypeDiagnosticsPending(false)
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
    setTypeDiagnosticsPending(false)
    clearTypeRecheckTimer()
  }

  const cancelTypeDiagnostics = () => {
    typeCheckRunId += 1
    clearTypeDiagnosticsState()
    setTypecheckButtonLoading(false)
  }

  return {
    cancelTypeDiagnostics,
    clearTypeDiagnosticsState,
    clearTypeRecheckTimer,
    getLastTypeErrorCount: () => lastTypeErrorCount,
    markTypeDiagnosticsStale,
    triggerTypeDiagnostics,
  }
}
