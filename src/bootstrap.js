import { getPrimaryCdnImportUrls } from './cdn.js'

/*
 * Preload only the modules needed for the initial render path.
 * - Included: core runtime + React runtime modules used immediately.
 * - Excluded: optional style compilers (sass/less/lightningCssWasm), which stay lazy.
 * Keep this list aligned with cdnImports keys in cdn.js.
 */
const preloadImportKeys = [
  'cssBrowser',
  'jsxDom',
  'jsxTranspile',
  'jsxReact',
  'react',
  'reactDomClient',
]

const ensureModulePreloadLinks = hrefs => {
  for (const href of hrefs) {
    const existing = document.head.querySelector(
      `link[rel="modulepreload"][href="${href}"]`,
    )

    if (existing) {
      continue
    }

    const link = document.createElement('link')
    link.rel = 'modulepreload'
    link.href = href
    link.crossOrigin = 'anonymous'
    document.head.append(link)
  }
}

ensureModulePreloadLinks(getPrimaryCdnImportUrls(preloadImportKeys))

await import('./app.js')
