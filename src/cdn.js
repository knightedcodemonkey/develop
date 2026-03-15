const cdnProviders = {
  esm: {
    label: 'esm.sh',
    host: 'https://esm.sh',
  },
  jspmGa: {
    label: 'ga.jspm.io',
    host: 'https://ga.jspm.io',
  },
}

/*
 * Toggle this between 'esm' and 'jspmGa' to swap the preferred CDN strategy.
 * The alternate provider is used as fallback automatically.
 */
const primaryCdnProvider = 'esm'

const secondaryCdnProvider = primaryCdnProvider === 'esm' ? 'jspmGa' : 'esm'

const fallbackCdnProviders = [secondaryCdnProvider]

const cdnImportSpecs = {
  cssBrowser: {
    esm: '@knighted/css/browser',
  },
  jsxDom: {
    esm: '@knighted/jsx',
  },
  jsxTranspile: {
    esm: '@knighted/jsx/transpile',
  },
  jsxReact: {
    esm: '@knighted/jsx/react',
  },
  react: {
    esm: 'react@19.2.4',
    jspmGa: 'npm:react@19.2.4/index.js',
  },
  reactDomClient: {
    esm: 'react-dom@19.2.4/client',
    jspmGa: 'npm:react-dom@19.2.4/client.js',
  },
  sass: {
    esm: 'sass@1.93.2?conditions=browser',
    jspmGa: 'npm:sass@1.93.2/sass.default.js',
  },
  less: {
    esm: 'less',
  },
  lightningCssWasm: {
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
    const specifier = specs[provider]
    if (!specifier) continue
    candidates.push({ provider, specifier })
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
