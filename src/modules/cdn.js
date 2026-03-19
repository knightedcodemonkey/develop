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
    jspmGa: 'npm:@knighted/css/browser',
  },
  jsxDom: {
    importMap: '@knighted/jsx',
    esm: '@knighted/jsx',
    jspmGa: 'npm:@knighted/jsx',
  },
  jsxTransform: {
    importMap: '@knighted/jsx/transform',
    esm: '@knighted/jsx/transform',
    jspmGa: 'npm:@knighted/jsx/transform',
  },
  jsxReact: {
    importMap: '@knighted/jsx/react',
    esm: '@knighted/jsx/react',
    jspmGa: 'npm:@knighted/jsx/react',
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
    jspmGa: 'npm:sass@1.93.2/sass.default.js',
  },
  less: {
    importMap: 'less',
    esm: 'less',
    jspmGa: 'npm:less',
  },
  lightningCssWasm: {
    importMap: '@parcel/css-wasm',
    esm: '@parcel/css-wasm',
    jspmGa: 'npm:@parcel/css-wasm',
  },
  typescript: {
    importMap: 'typescript',
    esm: 'typescript@5.9.3/lib/typescript.js',
    jspmGa: 'npm:typescript@5.9.3/lib/typescript.js',
  },
  codemirrorState: {
    importMap: '@codemirror/state',
    esm: '@codemirror/state',
    jspmGa: 'npm:@codemirror/state@6.5.2',
  },
  codemirrorView: {
    importMap: '@codemirror/view',
    esm: '@codemirror/view',
    jspmGa: 'npm:@codemirror/view@6.38.6',
  },
  codemirrorCommands: {
    importMap: '@codemirror/commands',
    esm: '@codemirror/commands',
    jspmGa: 'npm:@codemirror/commands@6.10.0',
  },
  codemirrorAutocomplete: {
    importMap: '@codemirror/autocomplete',
    esm: '@codemirror/autocomplete',
    jspmGa: 'npm:@codemirror/autocomplete@6.20.0',
  },
  codemirrorLanguage: {
    importMap: '@codemirror/language',
    esm: '@codemirror/language',
    jspmGa: 'npm:@codemirror/language@6.11.3',
  },
  codemirrorLezerHighlight: {
    importMap: '@lezer/highlight',
    esm: '@lezer/highlight',
    jspmGa: 'npm:@lezer/highlight@1.2.3',
  },
  codemirrorLangJavascript: {
    importMap: '@codemirror/lang-javascript',
    esm: '@codemirror/lang-javascript',
    jspmGa: 'npm:@codemirror/lang-javascript@6.2.4',
  },
  codemirrorLangCss: {
    importMap: '@codemirror/lang-css',
    esm: '@codemirror/lang-css',
    jspmGa: 'npm:@codemirror/lang-css@6.3.1',
  },
  eslintRuntime: {
    esm: ['eslint@10?bundle', 'eslint@10/use-at-your-own-risk?bundle'],
  },
  stylelintRuntime: {
    esm: 'stylelint@17.4.0?bundle',
    jspmGa: 'npm:stylelint@17.4.0/lib/index.mjs',
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
    return { module, url, provider: importCandidates[index].provider }
  } catch (error) {
    return importFromCdnCandidateAt(importCandidates, index + 1, firstError ?? error)
  }
}

export const importFromCdnWithFallback = importCandidates =>
  importFromCdnCandidateAt(importCandidates, 0)

const typeScriptVersion = '5.9.3'
const typeScriptLibBaseByProvider = {
  esm: `https://esm.sh/typescript@${typeScriptVersion}/lib`,
  unpkg: `https://unpkg.com/typescript@${typeScriptVersion}/lib`,
  jsdelivr: `https://cdn.jsdelivr.net/npm/typescript@${typeScriptVersion}/lib`,
}

const typePackageVersionByName = {
  '@types/react': '19.2.2',
  '@types/react-dom': '19.2.1',
  '@types/prop-types': '15.7.15',
  '@types/scheduler': '0.26.0',
  csstype: '3.1.3',
}

const getTypePackageVersion = packageName => typePackageVersionByName[packageName]

/*
 * Keep a reliable fallback order for .d.ts files when the active module provider
 * does not host TypeScript lib declarations consistently (e.g. import maps/jspmGa).
 */
const typeScriptLibFallbackProviderPriority = ['jsdelivr', 'unpkg', 'esm']

const getTypeScriptLibProviderPriority = typeScriptProvider => {
  const ordered = []

  if (
    typeof typeScriptProvider === 'string' &&
    typeScriptProvider in typeScriptLibBaseByProvider
  ) {
    ordered.push(typeScriptProvider)
  }

  for (const provider of typeScriptLibFallbackProviderPriority) {
    ordered.push(provider)
  }

  return [...new Set(ordered)]
}

const typePackageBaseByProvider = {
  esm: packageName => {
    const version = getTypePackageVersion(packageName)
    const versionSegment = version ? `@${version}` : ''
    return `https://esm.sh/${packageName}${versionSegment}`
  },
  unpkg: packageName => {
    const version = getTypePackageVersion(packageName)
    const versionSegment = version ? `@${version}` : ''
    return `https://unpkg.com/${packageName}${versionSegment}`
  },
  jsdelivr: packageName => {
    const version = getTypePackageVersion(packageName)
    const versionSegment = version ? `@${version}` : ''
    return `https://cdn.jsdelivr.net/npm/${packageName}${versionSegment}`
  },
}

export const getTypePackageFileUrls = (
  packageName,
  fileName,
  { typeScriptProvider } = {},
) => {
  const normalizedFileName =
    typeof fileName === 'string' && fileName.length > 0 ? fileName : 'package.json'
  const typePackageProviderPriority = [
    'jsdelivr',
    'unpkg',
    ...(typeof typeScriptProvider === 'string' ? [typeScriptProvider] : []),
    'esm',
  ]
  const providerOrderedBases = [...new Set(typePackageProviderPriority)]
    .map(provider => {
      const createBase = typePackageBaseByProvider[provider]
      return typeof createBase === 'function' ? createBase(packageName) : null
    })
    .filter(Boolean)

  return providerOrderedBases.map(baseUrl => `${baseUrl}/${normalizedFileName}`)
}

export const getTypeScriptLibUrls = (fileName, { typeScriptProvider } = {}) => {
  const providerOrderedBases = getTypeScriptLibProviderPriority(typeScriptProvider)
    .map(provider => typeScriptLibBaseByProvider[provider])
    .filter(Boolean)

  return providerOrderedBases.map(baseUrl => `${baseUrl}/${fileName}`)
}
