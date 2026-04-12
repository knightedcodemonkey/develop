import {
  isRelativeSpecifier,
  stripImportDeclarationsBy,
  toModuleSpecifierKey,
  toTabModuleKey,
} from './workspace-hydration.js'

const transpileOptionsByMode = {
  dom: {
    sourceType: 'module',
    createElement: '__knightedDomJsxRuntime.createElement',
    fragment: '__knightedDomJsxRuntime.Fragment',
    typescript: 'strip',
  },
  react: {
    sourceType: 'module',
    createElement: '__knightedReactRuntime.createElement',
    fragment: '__knightedReactRuntime.Fragment',
    typescript: 'strip',
  },
}

const previewEntryExportName = '__knightedPreviewEntryApp'
const maxTranspiledModuleCacheEntries = 300
const maxModuleDataUrlCacheEntries = 600

const transpiledModuleCache = new Map()
const moduleDataUrlCache = new Map()
const styleTabLanguages = new Set(['css', 'less', 'sass', 'module'])
const stylePathPattern = /\.(?:css|less|sass|scss)$/i

const trimCache = (cache, maxEntries) => {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    cache.delete(oldestKey)
  }
}

const getCachedValue = (cache, key) => {
  if (!cache.has(key)) {
    return null
  }

  const value = cache.get(key)
  cache.delete(key)
  cache.set(key, value)
  return value
}

const stripQueryAndHash = value => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.split(/[?#]/, 1)[0]
}

const normalizePathSegments = value => {
  const normalized = toModuleSpecifierKey(value)
  const inputParts = normalized.split('/')
  const outputParts = []

  for (const part of inputParts) {
    if (!part || part === '.') {
      continue
    }

    if (part === '..') {
      outputParts.pop()
      continue
    }

    outputParts.push(part)
  }

  return outputParts
}

const toNormalizedPath = value => normalizePathSegments(value).join('/')

const dirname = value => {
  const normalized = toNormalizedPath(value)
  const index = normalized.lastIndexOf('/')

  if (index < 0) {
    return ''
  }

  return normalized.slice(0, index)
}

const joinPath = (basePath, nextPath) => {
  const baseParts = normalizePathSegments(basePath)
  const nextParts = String(nextPath ?? '')
    .replace(/\\/g, '/')
    .split('/')

  for (const part of nextParts) {
    if (!part || part === '.') {
      continue
    }

    if (part === '..') {
      baseParts.pop()
      continue
    }

    baseParts.push(part)
  }

  return baseParts.join('/')
}

const extensionCandidates = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

const stripKnownExtension = value => {
  const input = typeof value === 'string' ? value : ''
  const lower = input.toLowerCase()

  for (const extension of extensionCandidates) {
    if (lower.endsWith(extension)) {
      return input.slice(0, -extension.length)
    }
  }

  return input
}

const toRelativeResolutionCandidateSets = ({ importerModuleKey, source }) => {
  const withoutQuery = stripQueryAndHash(source)
  const importerDir = dirname(importerModuleKey)
  const importerRelativePath = joinPath(importerDir, withoutQuery)
  const sourceRelativePath = toNormalizedPath(withoutQuery)
  const exactBaseCandidates = [importerRelativePath]

  if (sourceRelativePath) {
    exactBaseCandidates.push(sourceRelativePath)
  }

  const rootLikeSourcePath = sourceRelativePath.startsWith('src/')
    ? sourceRelativePath
    : ''

  if (rootLikeSourcePath) {
    exactBaseCandidates.push(rootLikeSourcePath)
  }

  const exactCandidates = [...new Set(exactBaseCandidates.filter(Boolean))]
  for (const candidate of exactBaseCandidates) {
    if (!candidate) {
      continue
    }

    exactCandidates.push(`./${candidate}`)
  }

  const compatibilityCandidates = []
  for (const baseCandidate of exactBaseCandidates) {
    if (!baseCandidate) {
      continue
    }

    const basePath = stripKnownExtension(baseCandidate)
    if (!basePath) {
      continue
    }

    for (const extension of extensionCandidates) {
      compatibilityCandidates.push(`${basePath}${extension}`)
    }

    for (const extension of extensionCandidates) {
      compatibilityCandidates.push(`${basePath}/index${extension}`)
    }

    compatibilityCandidates.push(`./${basePath}`)

    for (const extension of extensionCandidates) {
      compatibilityCandidates.push(`./${basePath}${extension}`)
    }

    for (const extension of extensionCandidates) {
      compatibilityCandidates.push(`./${basePath}/index${extension}`)
    }
  }

  const uniqueExactCandidates = [...new Set(exactCandidates)]
  const exactSet = new Set(uniqueExactCandidates)
  const uniqueCompatibilityCandidates = [...new Set(compatibilityCandidates)].filter(
    candidate => !exactSet.has(candidate),
  )

  return {
    exactCandidates: uniqueExactCandidates,
    compatibilityCandidates: uniqueCompatibilityCandidates,
  }
}

const toResolvedTabLabel = tab => toTabModuleKey(tab) || tab?.id || 'unknown-module'

const collectUniqueResolutionMatches = ({ candidates, byModuleKey }) => {
  const byTabId = new Map()

  for (const candidate of candidates) {
    const target = byModuleKey.get(candidate)
    if (!target || typeof target.id !== 'string' || byTabId.has(target.id)) {
      continue
    }

    byTabId.set(target.id, target)
  }

  return [...byTabId.values()]
}

const toAmbiguousResolutionError = ({ source, matches }) => {
  const labels = matches
    .map(toResolvedTabLabel)
    .sort((first, second) => first.localeCompare(second))
    .join(', ')

  return new Error(
    `Preview entry references ambiguous workspace module: ${source}. Matches: ${labels}`,
  )
}

const isStyleImportSpecifier = specifier => {
  if (typeof specifier !== 'string' || specifier.length === 0) {
    return false
  }

  const normalized = stripQueryAndHash(specifier).toLowerCase()
  return stylePathPattern.test(normalized)
}

const resolveRelativeWorkspaceImport = ({ importerModuleKey, source, byModuleKey }) => {
  const { exactCandidates, compatibilityCandidates } = toRelativeResolutionCandidateSets({
    importerModuleKey,
    source,
  })

  const exactMatches = collectUniqueResolutionMatches({
    candidates: exactCandidates,
    byModuleKey,
  })
  if (exactMatches.length > 1) {
    throw toAmbiguousResolutionError({
      source,
      matches: exactMatches,
    })
  }

  if (exactMatches.length === 1) {
    return exactMatches[0]
  }

  const compatibilityMatches = collectUniqueResolutionMatches({
    candidates: compatibilityCandidates,
    byModuleKey,
  })
  if (compatibilityMatches.length > 1) {
    throw toAmbiguousResolutionError({
      source,
      matches: compatibilityMatches,
    })
  }

  if (compatibilityMatches.length === 1) {
    return compatibilityMatches[0]
  }

  return null
}

const resolveWorkspaceStyleImport = ({ source, byModuleKey }) => {
  const normalizedSource = toModuleSpecifierKey(stripQueryAndHash(source))
  if (!normalizedSource) {
    return null
  }

  const fileName = normalizedSource.split('/').pop() || ''
  const candidatePool = [
    normalizedSource,
    `./${normalizedSource}`,
    `src/styles/${normalizedSource}`,
    `./src/styles/${normalizedSource}`,
  ]

  if (fileName && fileName !== normalizedSource) {
    candidatePool.push(
      fileName,
      `./${fileName}`,
      `src/styles/${fileName}`,
      `./src/styles/${fileName}`,
    )
  }

  const matches = collectUniqueResolutionMatches({
    candidates: [...new Set(candidatePool)],
    byModuleKey,
  })

  if (matches.length > 1) {
    throw toAmbiguousResolutionError({
      source,
      matches,
    })
  }

  return matches[0] ?? null
}

const resolveRelativeWorkspaceStyleImport = ({
  importerModuleKey,
  source,
  byModuleKey,
}) => {
  const { exactCandidates } = toRelativeResolutionCandidateSets({
    importerModuleKey,
    source,
  })

  const exactMatches = collectUniqueResolutionMatches({
    candidates: exactCandidates,
    byModuleKey,
  })

  if (exactMatches.length > 1) {
    throw toAmbiguousResolutionError({
      source,
      matches: exactMatches,
    })
  }

  return exactMatches[0] ?? null
}

const resolveWorkspaceImport = ({ importerModuleKey, source, byModuleKey }) => {
  if (isStyleImportSpecifier(source)) {
    if (isRelativeSpecifier(source)) {
      return resolveRelativeWorkspaceStyleImport({
        importerModuleKey,
        source,
        byModuleKey,
      })
    }

    return resolveWorkspaceStyleImport({
      source,
      byModuleKey,
    })
  }

  if (isRelativeSpecifier(source)) {
    return resolveRelativeWorkspaceImport({
      importerModuleKey,
      source,
      byModuleKey,
    })
  }

  return null
}

const withEntryAppExportShim = source => {
  return `${source}\nexport const ${previewEntryExportName} = typeof App === 'function' ? App : undefined`
}

const rewriteImportSpecifiers = ({ source, imports, resolveSpecifier }) => {
  const rewrites = imports
    .map(entry => {
      const range = entry?.range
      if (!Array.isArray(range) || range.length !== 2) {
        return null
      }

      const declaration = source.slice(range[0], range[1])
      const resolvedSpecifier = resolveSpecifier(entry.source)
      if (!resolvedSpecifier) {
        return null
      }

      const escapedSource = entry.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const sourcePattern = new RegExp(`(['"])${escapedSource}\\1`)
      if (!sourcePattern.test(declaration)) {
        return null
      }

      const nextDeclaration = declaration.replace(
        sourcePattern,
        (_match, quote) => `${quote}${resolvedSpecifier}${quote}`,
      )

      return {
        start: range[0],
        end: range[1],
        value: nextDeclaration,
      }
    })
    .filter(Boolean)
    .sort((first, second) => second.start - first.start)

  let output = source

  for (const rewrite of rewrites) {
    output = `${output.slice(0, rewrite.start)}${rewrite.value}${output.slice(rewrite.end)}`
  }

  return output
}

const toModuleDataUrl = code =>
  `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`

const runtimeSpecifierRewrites = runtimeSpecifiers => ({
  react: runtimeSpecifiers.react,
  'react-dom/client': runtimeSpecifiers.reactDomClient,
  '@knighted/jsx/dom': runtimeSpecifiers.jsxDom,
  '@knighted/jsx/react': runtimeSpecifiers.jsxReact,
})

const createTabLookup = tabs => {
  const byId = new Map()
  const byModuleKey = new Map()

  for (const tab of tabs) {
    if (!tab || typeof tab !== 'object' || typeof tab.id !== 'string' || !tab.id) {
      continue
    }

    const moduleKey = toTabModuleKey(tab)
    if (!moduleKey) {
      continue
    }

    byId.set(tab.id, tab)

    if (!byModuleKey.has(moduleKey)) {
      byModuleKey.set(moduleKey, tab)
    }

    if (!byModuleKey.has(`./${moduleKey}`)) {
      byModuleKey.set(`./${moduleKey}`, tab)
    }
  }

  return {
    byId,
    byModuleKey,
  }
}

const toCycleImportPath = ({ cycleEntries, viaSpecifier }) =>
  [...cycleEntries.slice(1).map(entry => entry.viaSpecifier), viaSpecifier]
    .filter(Boolean)
    .join(' -> ')

const ensureMode = mode => (mode === 'react' ? 'react' : 'dom')

const isStyleTab = tab => {
  if (!tab || typeof tab !== 'object') {
    return false
  }

  if (
    typeof tab.language === 'string' &&
    styleTabLanguages.has(tab.language.trim().toLowerCase())
  ) {
    return true
  }

  const identity =
    typeof tab.path === 'string' && tab.path.trim().length > 0
      ? tab.path
      : typeof tab.name === 'string'
        ? tab.name
        : ''

  return stylePathPattern.test(identity)
}

const toRuntimePrelude = ({ mode, runtimeSpecifiers }) => {
  if (mode === 'react') {
    return `import __knightedReactRuntime from '${runtimeSpecifiers.react}'`
  }

  return `import { jsx as __knightedDomJsxRuntime } from '${runtimeSpecifiers.jsxDom}'`
}

const parseImports = ({
  source,
  transformJsxSource,
  formatTransformDiagnosticsError,
}) => {
  const analysis = transformJsxSource(source, {
    sourceType: 'module',
    typescript: 'preserve',
  })

  if (analysis.diagnostics.length > 0) {
    throw new Error(formatTransformDiagnosticsError(analysis.diagnostics))
  }

  return analysis.imports ?? []
}

const getTranspiledModule = ({
  source,
  mode,
  transformJsxSource,
  formatTransformDiagnosticsError,
}) => {
  const cacheKey = `${mode}\u0000${source}`
  const cached = getCachedValue(transpiledModuleCache, cacheKey)
  if (cached) {
    if (cached.error) {
      throw new Error(cached.error)
    }

    return cached
  }

  const transpiled = transformJsxSource(source, transpileOptionsByMode[mode])
  if (transpiled.diagnostics.length > 0) {
    const error = formatTransformDiagnosticsError(transpiled.diagnostics)
    transpiledModuleCache.set(cacheKey, { error })
    trimCache(transpiledModuleCache, maxTranspiledModuleCacheEntries)
    throw new Error(error)
  }

  const imports = parseImports({
    source: transpiled.code,
    transformJsxSource,
    formatTransformDiagnosticsError,
  })

  const value = {
    code: transpiled.code,
    imports,
  }

  transpiledModuleCache.set(cacheKey, value)
  trimCache(transpiledModuleCache, maxTranspiledModuleCacheEntries)
  return value
}

export const planWorkspaceVirtualModules = ({
  tabs,
  entryTab,
  transformJsxSource,
  formatTransformDiagnosticsError,
  workspaceGraphCache,
  mode,
  runtimeSpecifiers,
}) => {
  if (!entryTab || typeof entryTab.content !== 'string') {
    return null
  }

  const resolvedMode = ensureMode(mode)
  const { byId, byModuleKey } = createTabLookup(tabs)
  const visited = new Set()
  const visiting = new Set()
  const visitStack = []
  const dependencyOrder = []
  const styleDependencyOrder = []
  const moduleDependencyOrder = []
  const importsByTabId = new Map()

  const getParsedImportsForTab = tab => {
    if (!tab || typeof tab.id !== 'string' || tab.id.length === 0) {
      return []
    }

    if (importsByTabId.has(tab.id)) {
      return importsByTabId.get(tab.id)
    }

    if (isStyleTab(tab)) {
      importsByTabId.set(tab.id, [])
      return []
    }

    const source = typeof tab.content === 'string' ? tab.content : ''
    const imports = parseImports({
      source,
      transformJsxSource,
      formatTransformDiagnosticsError,
    })
    importsByTabId.set(tab.id, imports)
    return imports
  }

  const visit = (tab, { viaSpecifier = '' } = {}) => {
    if (!tab || typeof tab.id !== 'string') {
      return
    }

    if (visiting.has(tab.id)) {
      const cycleStartIndex = visitStack.findIndex(entry => entry.id === tab.id)
      const cycleEntries =
        cycleStartIndex >= 0 ? visitStack.slice(cycleStartIndex) : [...visitStack]
      const cycleLabels = [
        ...cycleEntries.map(entry => entry.label),
        toTabModuleKey(tab) || tab.id,
      ]
      const importPath = toCycleImportPath({ cycleEntries, viaSpecifier })
      const importHint = importPath ? ` Import chain: ${importPath}.` : ''

      throw new Error(
        `Preview entry contains circular workspace import: ${cycleLabels.join(' -> ')}.${importHint}`,
      )
    }

    if (visited.has(tab.id)) {
      return
    }

    visiting.add(tab.id)
    visitStack.push({
      id: tab.id,
      label: toTabModuleKey(tab) || tab.id,
      viaSpecifier,
    })

    try {
      const imports = getParsedImportsForTab(tab)

      workspaceGraphCache.upsert({
        tabId: tab.id,
        imports: imports.map(entry => entry?.source).filter(Boolean),
        lastUpdated: Date.now(),
      })

      const importerModuleKey = toTabModuleKey(tab)

      for (const entry of imports) {
        if (
          !isRelativeSpecifier(entry?.source) &&
          !isStyleImportSpecifier(entry?.source)
        ) {
          continue
        }

        const target = resolveWorkspaceImport({
          importerModuleKey,
          source: entry.source,
          byModuleKey,
        })

        if (!target) {
          throw new Error(
            `Preview entry references missing workspace module: ${entry.source}`,
          )
        }

        visit(target, { viaSpecifier: entry.source })
      }

      visited.add(tab.id)
      dependencyOrder.push(tab.id)
    } finally {
      visitStack.pop()
      visiting.delete(tab.id)
    }
  }

  visit(entryTab)

  for (const tabId of dependencyOrder) {
    const tab = byId.get(tabId)
    if (!tab) {
      continue
    }

    if (isStyleTab(tab)) {
      styleDependencyOrder.push(tabId)
    } else {
      moduleDependencyOrder.push(tabId)
    }
  }

  const moduleDataByTabId = new Map()

  for (const tabId of moduleDependencyOrder) {
    const tab = byId.get(tabId)
    if (!tab) {
      continue
    }

    const moduleKey = toTabModuleKey(tab)
    const source = typeof tab.content === 'string' ? tab.content : ''
    const transpiled = getTranspiledModule({
      source,
      mode: resolvedMode,
      transformJsxSource,
      formatTransformDiagnosticsError,
    })

    moduleDataByTabId.set(tabId, {
      moduleKey,
      source: transpiled.code,
      imports: transpiled.imports,
    })
  }

  const runtimeRewrites = runtimeSpecifierRewrites(runtimeSpecifiers)
  const moduleUrlByTabId = new Map()

  for (const tabId of moduleDependencyOrder) {
    const tab = byId.get(tabId)
    const moduleData = moduleDataByTabId.get(tabId)

    if (!tab || !moduleData) {
      continue
    }

    const sourceWithoutStyleImports = stripImportDeclarationsBy(
      moduleData.source,
      moduleData.imports,
      entry => {
        if (
          !isRelativeSpecifier(entry?.source) &&
          !isStyleImportSpecifier(entry?.source)
        ) {
          return false
        }

        const target = resolveWorkspaceImport({
          importerModuleKey: moduleData.moduleKey,
          source: entry.source,
          byModuleKey,
        })

        return isStyleTab(target)
      },
    )

    const importsForRewrite = parseImports({
      source: sourceWithoutStyleImports,
      transformJsxSource,
      formatTransformDiagnosticsError,
    })

    const rewrittenCode = rewriteImportSpecifiers({
      source: sourceWithoutStyleImports,
      imports: importsForRewrite,
      resolveSpecifier: sourceSpecifier => {
        if (
          isRelativeSpecifier(sourceSpecifier) ||
          isStyleImportSpecifier(sourceSpecifier)
        ) {
          const target = resolveWorkspaceImport({
            importerModuleKey: moduleData.moduleKey,
            source: sourceSpecifier,
            byModuleKey,
          })

          if (!target || typeof target.id !== 'string') {
            return null
          }

          if (isStyleTab(target)) {
            return null
          }

          return moduleUrlByTabId.get(target.id) ?? null
        }

        if (Object.hasOwn(runtimeRewrites, sourceSpecifier)) {
          return runtimeRewrites[sourceSpecifier]
        }

        return null
      },
    })

    const prelude = toRuntimePrelude({
      mode: resolvedMode,
      runtimeSpecifiers,
    })
    const executableCode =
      tabId === entryTab.id ? withEntryAppExportShim(rewrittenCode) : rewrittenCode
    const sourceUrl = `//# sourceURL=knighted-workspace/${moduleData.moduleKey || tab.id}.mjs`
    const moduleCacheKey = [
      resolvedMode,
      tabId === entryTab.id ? 'entry' : 'module',
      moduleData.moduleKey || tab.id,
      prelude,
      executableCode,
    ].join('\u0000')
    const cachedModuleUrl = getCachedValue(moduleDataUrlCache, moduleCacheKey)
    const moduleUrl =
      typeof cachedModuleUrl === 'string'
        ? cachedModuleUrl
        : toModuleDataUrl(`${prelude}\n${executableCode}\n${sourceUrl}`)

    if (!cachedModuleUrl) {
      moduleDataUrlCache.set(moduleCacheKey, moduleUrl)
      trimCache(moduleDataUrlCache, maxModuleDataUrlCacheEntries)
    }

    moduleUrlByTabId.set(tabId, moduleUrl)
  }

  const entryModuleUrl = moduleUrlByTabId.get(entryTab.id)
  if (typeof entryModuleUrl !== 'string' || entryModuleUrl.length === 0) {
    return null
  }

  const entryModuleKey = toTabModuleKey(entryTab) || entryTab.id

  return {
    entryTabId: entryTab.id,
    includedTabIds: [...dependencyOrder],
    includedStyleTabIds: [...styleDependencyOrder],
    entrySpecifier: entryModuleUrl,
    entryDisplaySpecifier: `@knighted/workspace/${entryModuleKey}`,
    entryExportName: previewEntryExportName,
    importMap: {
      imports: {},
    },
    dispose: () => {},
  }
}
