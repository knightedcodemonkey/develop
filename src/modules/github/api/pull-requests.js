import { buildRepoApiUrl, requestGitHubJson } from './core.js'

const normalizePullRequestSummary = pullRequest => {
  if (!pullRequest || typeof pullRequest !== 'object') {
    return null
  }

  const number =
    typeof pullRequest.number === 'number' && Number.isFinite(pullRequest.number)
      ? pullRequest.number
      : null
  const htmlUrl = typeof pullRequest.html_url === 'string' ? pullRequest.html_url : ''
  const title = typeof pullRequest.title === 'string' ? pullRequest.title : ''
  const state = typeof pullRequest.state === 'string' ? pullRequest.state : ''
  const headRef = typeof pullRequest?.head?.ref === 'string' ? pullRequest.head.ref : ''
  const baseRef = typeof pullRequest?.base?.ref === 'string' ? pullRequest.base.ref : ''

  if (!number) {
    return null
  }

  return {
    number,
    htmlUrl,
    title,
    state,
    headRef,
    baseRef,
    isOpen: state.toLowerCase() === 'open',
  }
}

const createRepositoryPullRequest = async ({
  token,
  owner,
  repo,
  title,
  body,
  head,
  base,
  signal,
}) => {
  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: '/pulls' }),
    method: 'POST',
    body: {
      title,
      body,
      head,
      base,
    },
    signal,
  })

  return {
    number: response?.number,
    htmlUrl: typeof response?.html_url === 'string' ? response.html_url : '',
    apiUrl: typeof response?.url === 'string' ? response.url : '',
  }
}

const closeRepositoryPullRequest = async ({
  token,
  owner,
  repo,
  pullRequestNumber,
  signal,
}) => {
  const number = Number(pullRequestNumber)
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error('A valid pull request number is required to close a pull request.')
  }

  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: `/pulls/${number}` }),
    method: 'PATCH',
    body: {
      state: 'closed',
    },
    signal,
  })

  return normalizePullRequestSummary(response)
}

const getRepositoryPullRequest = async ({
  token,
  owner,
  repo,
  pullRequestNumber,
  signal,
}) => {
  const number = Number(pullRequestNumber)
  if (!Number.isFinite(number) || number <= 0) {
    return null
  }

  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: `/pulls/${number}` }),
    signal,
    allowNotFound: true,
  })

  if (!response) {
    return null
  }

  return normalizePullRequestSummary(response)
}

const findOpenRepositoryPullRequestByHead = async ({
  token,
  owner,
  repo,
  headOwner,
  headBranch,
  baseBranch,
  signal,
}) => {
  const normalizedHeadBranch = typeof headBranch === 'string' ? headBranch.trim() : ''
  if (!normalizedHeadBranch) {
    return null
  }

  const normalizedHeadOwner =
    typeof headOwner === 'string' && headOwner.trim() ? headOwner.trim() : owner
  const query = new URLSearchParams({
    state: 'open',
    head: `${normalizedHeadOwner}:${normalizedHeadBranch}`,
    per_page: '20',
  })

  if (typeof baseBranch === 'string' && baseBranch.trim()) {
    query.set('base', baseBranch.trim())
  }

  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: `/pulls?${query.toString()}` }),
    signal,
  })

  if (!Array.isArray(response) || response.length === 0) {
    return null
  }

  const normalized = response.map(normalizePullRequestSummary).filter(Boolean)

  const exactBranchMatch = normalized.find(
    pullRequest => pullRequest.headRef === normalizedHeadBranch,
  )

  return exactBranchMatch ?? normalized[0] ?? null
}

export {
  closeRepositoryPullRequest,
  createRepositoryPullRequest,
  findOpenRepositoryPullRequestByHead,
  getRepositoryPullRequest,
}
