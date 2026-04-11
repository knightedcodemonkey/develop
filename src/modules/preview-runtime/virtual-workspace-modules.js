import {
  isRelativeSpecifier,
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

const withEntryAppExportShim = source => {
  return `${source}\nexport const ${previewEntryExportName} = typeof App === 'function' ? App : undefined`
}

const rewriteRelativeImportSpecifiers = ({
  source,
  imports,
  resolveRelativeSpecifier,
}) => {
  const rewrites = imports
    .filter(entry => isRelativeSpecifier(entry?.source))
    .map(entry => {
      const range = entry?.range
      if (!Array.isArray(range) || range.length !== 2) {
        return null
      }

      const declaration = source.slice(range[0], range[1])
      const resolvedSpecifier = resolveRelativeSpecifier(entry.source)
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

const toVirtualSpecifier = moduleKey => `@knighted/workspace/${moduleKey}`

const toModuleDataUrl = code =>
  `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`

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
  const importsByTabId = new Map()

  const getParsedImportsForTab = tab => {
    if (!tab || typeof tab.id !== 'string' || tab.id.length === 0) {
      return []
    }

    if (importsByTabId.has(tab.id)) {
      return importsByTabId.get(tab.id)
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
        if (!isRelativeSpecifier(entry?.source)) {
          continue
        }

        const target = resolveRelativeWorkspaceImport({
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

  const moduleDataByTabId = new Map()

  for (const tabId of dependencyOrder) {
    const tab = byId.get(tabId)
    if (!tab) {
      continue
    }

    const moduleKey = toTabModuleKey(tab)
    const source = typeof tab.content === 'string' ? tab.content : ''
    const transpiled = transformJsxSource(source, transpileOptionsByMode[resolvedMode])

    if (transpiled.diagnostics.length > 0) {
      throw new Error(formatTransformDiagnosticsError(transpiled.diagnostics))
    }

    const transpiledImports = parseImports({
      source: transpiled.code,
      transformJsxSource,
      formatTransformDiagnosticsError,
    })

    moduleDataByTabId.set(tabId, {
      moduleKey,
      source: transpiled.code,
      imports: transpiledImports,
      virtualSpecifier: toVirtualSpecifier(moduleKey || tab.id),
    })
  }

  const importMapImports = {}
  importMapImports.react = runtimeSpecifiers.react
  importMapImports['react-dom/client'] = runtimeSpecifiers.reactDomClient
  importMapImports['@knighted/jsx/dom'] = runtimeSpecifiers.jsxDom
  importMapImports['@knighted/jsx/react'] = runtimeSpecifiers.jsxReact

  for (const tabId of dependencyOrder) {
    const tab = byId.get(tabId)
    const moduleData = moduleDataByTabId.get(tabId)

    if (!tab || !moduleData) {
      continue
    }

    const rewrittenCode = rewriteRelativeImportSpecifiers({
      source: moduleData.source,
      imports: moduleData.imports,
      resolveRelativeSpecifier: sourceSpecifier => {
        const target = resolveRelativeWorkspaceImport({
          importerModuleKey: moduleData.moduleKey,
          source: sourceSpecifier,
          byModuleKey,
        })

        if (!target || typeof target.id !== 'string') {
          return null
        }

        const targetData = moduleDataByTabId.get(target.id)
        return targetData?.virtualSpecifier ?? null
      },
    })

    const prelude = toRuntimePrelude({
      mode: resolvedMode,
      runtimeSpecifiers,
    })
    const executableCode =
      tabId === entryTab.id ? withEntryAppExportShim(rewrittenCode) : rewrittenCode
    const sourceUrl = `//# sourceURL=knighted-workspace/${moduleData.moduleKey || tab.id}.mjs`
    const moduleCode = `${prelude}\n${executableCode}\n${sourceUrl}`
    const moduleUrl = toModuleDataUrl(moduleCode)

    importMapImports[moduleData.virtualSpecifier] = moduleUrl
  }

  const entryData = moduleDataByTabId.get(entryTab.id)
  if (!entryData) {
    return null
  }

  return {
    entryTabId: entryTab.id,
    includedTabIds: [...dependencyOrder],
    entrySpecifier: entryData.virtualSpecifier,
    entryExportName: previewEntryExportName,
    importMap: {
      imports: importMapImports,
    },
    dispose: () => {},
  }
}
