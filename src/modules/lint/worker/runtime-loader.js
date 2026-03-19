import { cdnImports, importFromCdnWithFallback } from '../../cdn.js'

let eslintRuntimePromise = null
let stylelintRuntimePromise = null

export const loadEslintRuntime = async () => {
  if (!eslintRuntimePromise) {
    eslintRuntimePromise = importFromCdnWithFallback(cdnImports.eslintRuntime)
  }

  return eslintRuntimePromise
}

export const loadStylelintRuntime = async () => {
  if (!stylelintRuntimePromise) {
    stylelintRuntimePromise = importFromCdnWithFallback(cdnImports.stylelintRuntime)
  }

  return stylelintRuntimePromise
}
