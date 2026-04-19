import { githubApiBaseUrl } from './constants.js'
import { fetchJson } from './core.js'

const normalizeRepo = repo => {
  const owner = repo?.owner?.login
  const name = repo?.name
  const fullName = repo?.full_name

  if (
    typeof owner !== 'string' ||
    typeof name !== 'string' ||
    typeof fullName !== 'string'
  ) {
    return null
  }

  return {
    id: repo.id,
    owner,
    name,
    fullName,
    defaultBranch: typeof repo.default_branch === 'string' ? repo.default_branch : 'main',
    permissions: repo.permissions ?? {},
    htmlUrl: typeof repo.html_url === 'string' ? repo.html_url : null,
  }
}

const hasWritePermission = permissions => Boolean(permissions && permissions.push)

const normalizeBranchName = branch => {
  if (!branch || typeof branch !== 'object') {
    return null
  }

  return typeof branch.name === 'string' && branch.name.trim() ? branch.name : null
}

const listReposPage = async ({ token, url, signal }) => {
  const { data, nextPageUrl } = await fetchJson({ token, url, signal })

  if (!Array.isArray(data)) {
    throw new Error('Unexpected response while loading repositories from GitHub.')
  }

  return {
    repos: data.map(normalizeRepo).filter(Boolean),
    nextPageUrl,
  }
}

const listBranchesPage = async ({ token, url, signal }) => {
  const { data, nextPageUrl } = await fetchJson({ token, url, signal })

  if (!Array.isArray(data)) {
    throw new Error('Unexpected response while loading repository branches from GitHub.')
  }

  return {
    branches: data.map(normalizeBranchName).filter(Boolean),
    nextPageUrl,
  }
}

const listWritableRepositories = async ({ token, signal }) => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('A GitHub token is required to load repositories.')
  }

  const writableRepos = []
  const dedupeById = new Set()
  let nextPageUrl = `${githubApiBaseUrl}/user/repos?sort=updated&per_page=100`
  let remainingPageBudget = 10

  while (nextPageUrl && remainingPageBudget > 0) {
    /* GitHub pagination is cursor-like via Link headers, so each request depends on the previous page. */
    // eslint-disable-next-line no-await-in-loop
    const page = await listReposPage({ token, url: nextPageUrl, signal })
    for (const repo of page.repos) {
      if (!hasWritePermission(repo.permissions) || dedupeById.has(repo.id)) {
        continue
      }
      dedupeById.add(repo.id)
      writableRepos.push(repo)
    }

    nextPageUrl = page.nextPageUrl
    remainingPageBudget -= 1
  }

  writableRepos.sort((left, right) => left.fullName.localeCompare(right.fullName))

  return writableRepos
}

const listRepositoryBranches = async ({ token, owner, repo, signal }) => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('A GitHub token is required to load branches.')
  }

  const normalizedOwner = typeof owner === 'string' ? owner.trim() : ''
  const normalizedRepo = typeof repo === 'string' ? repo.trim() : ''

  if (!normalizedOwner || !normalizedRepo) {
    throw new Error('A valid repository owner/name is required to load branches.')
  }

  const branches = []
  const dedupe = new Set()
  const collectBranchesByPage = async ({ url, remainingPageBudget }) => {
    if (!url || remainingPageBudget <= 0) {
      return
    }

    const page = await listBranchesPage({ token, url, signal })

    for (const name of page.branches) {
      if (dedupe.has(name)) {
        continue
      }

      dedupe.add(name)
      branches.push(name)
    }

    await collectBranchesByPage({
      url: page.nextPageUrl,
      remainingPageBudget: remainingPageBudget - 1,
    })
  }

  await collectBranchesByPage({
    url: `${githubApiBaseUrl}/repos/${normalizedOwner}/${normalizedRepo}/branches?per_page=100`,
    remainingPageBudget: 5,
  })

  branches.sort((left, right) => left.localeCompare(right))
  return branches
}

export { listRepositoryBranches, listWritableRepositories }
