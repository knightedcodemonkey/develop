const cdnProviders = {
  importMap: {
    label: 'import map',
    host: '',
  },
  esm: {
    label: 'esm.sh',
    host: 'https://esm.sh',
  },
  unpkg: {
    label: 'unpkg',
    host: 'https://unpkg.com',
  },
  jspmGa: {
    label: 'ga.jspm.io',
    host: 'https://ga.jspm.io',
  },
}

/*
 * Local dev defaults to esm.sh.
 * Production can set window.__KNIGHTED_PRIMARY_CDN__ = 'importMap'.
 */
const defaultPrimaryCdnProvider = 'esm'

const configuredPrimaryCdnProvider =
  typeof globalThis !== 'undefined' &&
  typeof globalThis.__KNIGHTED_PRIMARY_CDN__ === 'string'
    ? globalThis.__KNIGHTED_PRIMARY_CDN__
    : defaultPrimaryCdnProvider

const primaryCdnProvider =
  configuredPrimaryCdnProvider in cdnProviders
    ? configuredPrimaryCdnProvider
    : defaultPrimaryCdnProvider

const fallbackCdnProvidersByPrimary = {
  importMap: ['esm', 'unpkg', 'jspmGa'],
  esm: ['unpkg', 'jspmGa'],
  unpkg: ['esm', 'jspmGa'],
  jspmGa: ['unpkg', 'esm'],
}

const fallbackCdnProviders = fallbackCdnProvidersByPrimary[primaryCdnProvider] ?? []

export const cdnImportSpecs = {
  cssBrowser: {
    importMap: '@knighted/css/browser',
    esm: '@knighted/css/browser',
  },
  jsxDom: {
    importMap: '@knighted/jsx',
    esm: '@knighted/jsx',
  },
  jsxTranspile: {
    importMap: '@knighted/jsx/transpile',
    esm: '@knighted/jsx/transpile',
  },
  jsxReact: {
    importMap: '@knighted/jsx/react',
    esm: '@knighted/jsx/react',
  },
  react: {
    importMap: 'react',
    esm: 'react@19.2.4',
    jspmGa: 'npm:react@19.2.4/index.js',
  },
  reactDomClient: {
    importMap: 'react-dom/client',
    esm: 'react-dom@19.2.4/client',
    jspmGa: 'npm:react-dom@19.2.4/client.js',
  },
  sass: {
    importMap: 'sass',
    esm: [
      'sass@1.93.2?conditions=browser',
      'sass@1.93.2/sass.default?conditions=browser',
    ],
    unpkg: 'sass@1.93.2/sass.default.js?module',
  },
  less: {
    importMap: 'less',
    esm: 'less',
  },
  lightningCssWasm: {
    importMap: '@parcel/css-wasm',
    esm: '@parcel/css-wasm',
  },
}

const getProviderPriority = () => {
  const ordered = [primaryCdnProvider, ...fallbackCdnProviders]
  return [...new Set(ordered)]
}

const getCdnImportCandidates = importKey => {
  const specs = cdnImportSpecs[importKey]
  if (!specs || typeof specs !== 'object') {
    throw new Error(`Unknown CDN import key: ${String(importKey)}`)
  }

  const candidates = []

  for (const provider of getProviderPriority()) {
    const configured = specs[provider]
    if (!configured) continue

    const specifiers = Array.isArray(configured) ? configured : [configured]
    for (const specifier of specifiers) {
      if (typeof specifier !== 'string' || specifier.length === 0) continue
      candidates.push({ provider, specifier })
    }
  }

  if (candidates.length === 0) {
    throw new Error(`No CDN candidates configured for import key: ${String(importKey)}`)
  }

  return candidates
}

export const cdnImports = Object.fromEntries(
  Object.keys(cdnImportSpecs).map(importKey => [
    importKey,
    getCdnImportCandidates(importKey),
  ]),
)

export const getCdnImportUrl = ({ provider, specifier }) => {
  const config = cdnProviders[provider]
  if (!config) {
    throw new Error(`Unknown CDN provider: ${String(provider)}`)
  }
  if (provider === 'importMap') {
    return specifier
  }
  return `${config.host}/${specifier}`
}

export const getPrimaryCdnImportUrl = importKey => {
  const candidates = cdnImports[importKey]
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`Unknown CDN import key: ${String(importKey)}`)
  }
  return getCdnImportUrl(candidates[0])
}

export const getPrimaryCdnImportUrls = importKeys => {
  const unique = new Set()

  for (const key of importKeys) {
    unique.add(getPrimaryCdnImportUrl(key))
  }

  return [...unique]
}

const importFromCdnCandidateAt = async (importCandidates, index, firstError = null) => {
  if (index >= importCandidates.length) {
    throw (
      firstError ?? new Error('Unknown module loading failure while importing from CDN.')
    )
  }

  const url = getCdnImportUrl(importCandidates[index])

  try {
    const module = await import(url)
    return { module, url }
  } catch (error) {
    return importFromCdnCandidateAt(importCandidates, index + 1, firstError ?? error)
  }
}

export const importFromCdnWithFallback = importCandidates =>
  importFromCdnCandidateAt(importCandidates, 0)
