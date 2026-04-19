import { parsePullRequestNumberFromUrl } from '../context.js'
import {
  normalizePrContextState,
  normalizeRenderMode,
  normalizeStyleMode,
  sanitizeBranchPart,
  toPullRequestNumber,
  toSafeText,
} from './common.js'

const prConfigStoragePrefix = 'knighted:develop:github-pr-config:'

const getRepositoryPrConfigStorageKey = repositoryFullName =>
  `${prConfigStoragePrefix}${repositoryFullName}`

const pruneRepositoryPrConfigs = repositoryFullName => {
  if (typeof repositoryFullName !== 'string' || !repositoryFullName.trim()) {
    return
  }

  const activeStorageKey = getRepositoryPrConfigStorageKey(repositoryFullName)

  try {
    const keysToRemove = []

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith(prConfigStoragePrefix)) {
        continue
      }

      if (key !== activeStorageKey) {
        keysToRemove.push(key)
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  } catch {
    /* noop */
  }
}

const readRepositoryPrConfig = repositoryFullName => {
  if (typeof repositoryFullName !== 'string' || !repositoryFullName.trim()) {
    return {}
  }

  try {
    const value = localStorage.getItem(
      getRepositoryPrConfigStorageKey(repositoryFullName),
    )
    if (!value) {
      return {}
    }

    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveRepositoryPrConfig = ({ repositoryFullName, config }) => {
  if (typeof repositoryFullName !== 'string' || !repositoryFullName.trim()) {
    return
  }

  try {
    const activeStorageKey = getRepositoryPrConfigStorageKey(repositoryFullName)

    localStorage.setItem(activeStorageKey, JSON.stringify(config))

    pruneRepositoryPrConfigs(repositoryFullName)
  } catch {
    /* noop */
  }
}

const sanitizeRepositoryPrConfig = config => {
  const source = config && typeof config === 'object' ? config : {}
  const pullRequestUrl = toSafeText(source.pullRequestUrl)
  const fallbackPullRequestNumber = parsePullRequestNumberFromUrl(pullRequestUrl)
  const pullRequestNumber =
    toPullRequestNumber(source.pullRequestNumber) ?? fallbackPullRequestNumber
  const isActivePr = source.isActivePr === true
  const normalizedPrContextState = normalizePrContextState(source.prContextState)
  const prContextState = isActivePr
    ? 'active'
    : normalizedPrContextState === 'active'
      ? 'inactive'
      : normalizedPrContextState

  return {
    baseBranch: toSafeText(source.baseBranch),
    headBranch: sanitizeBranchPart(source.headBranch),
    prTitle: toSafeText(source.prTitle),
    prBody: typeof source.prBody === 'string' ? source.prBody.trim() : '',
    renderMode: normalizeRenderMode(source.renderMode),
    styleMode: normalizeStyleMode(source.styleMode),
    isActivePr,
    prContextState,
    pullRequestNumber,
    pullRequestUrl,
  }
}

const removeRepositoryPrConfig = repositoryFullName => {
  if (typeof repositoryFullName !== 'string' || !repositoryFullName.trim()) {
    return
  }

  try {
    localStorage.removeItem(getRepositoryPrConfigStorageKey(repositoryFullName))
  } catch {
    /* noop */
  }
}

const getActiveRepositoryPrContext = repositoryFullName => {
  const savedConfig = sanitizeRepositoryPrConfig(
    readRepositoryPrConfig(repositoryFullName),
  )

  if (savedConfig?.isActivePr !== true) {
    return null
  }

  const headBranch = sanitizeBranchPart(savedConfig.headBranch)
  const prTitle = toSafeText(savedConfig.prTitle)
  const baseBranch = toSafeText(savedConfig.baseBranch)

  if (!headBranch || !prTitle) {
    return null
  }

  return {
    headBranch,
    renderMode: normalizeRenderMode(savedConfig.renderMode),
    styleMode: normalizeStyleMode(savedConfig.styleMode),
    prTitle,
    prBody: typeof savedConfig.prBody === 'string' ? savedConfig.prBody : '',
    baseBranch,
    pullRequestNumber:
      typeof savedConfig.pullRequestNumber === 'number' &&
      Number.isFinite(savedConfig.pullRequestNumber)
        ? savedConfig.pullRequestNumber
        : parsePullRequestNumberFromUrl(savedConfig.pullRequestUrl),
    pullRequestUrl:
      typeof savedConfig.pullRequestUrl === 'string' ? savedConfig.pullRequestUrl : '',
    repositoryFullName,
  }
}

const findRepositoryWithActivePrContext = repositories => {
  if (!Array.isArray(repositories) || repositories.length === 0) {
    return null
  }

  for (const repository of repositories) {
    const repositoryFullName = toSafeText(repository?.fullName)

    if (!repositoryFullName) {
      continue
    }

    if (getActiveRepositoryPrContext(repositoryFullName)) {
      return repositoryFullName
    }
  }

  return null
}

export {
  findRepositoryWithActivePrContext,
  getActiveRepositoryPrContext,
  readRepositoryPrConfig,
  removeRepositoryPrConfig,
  sanitizeRepositoryPrConfig,
  saveRepositoryPrConfig,
}
