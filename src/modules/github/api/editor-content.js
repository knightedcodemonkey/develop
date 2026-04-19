import { buildRepoApiUrl, requestGitHubJson } from './core.js'
import { createBranchReference, getBranchReferenceSha } from './repository-files.js'
import { createRepositoryPullRequest } from './pull-requests.js'

const normalizeFileUpdatePath = value =>
  (typeof value === 'string' ? value.trim() : '').replace(/\\/g, '/').replace(/\/+/g, '/')

const validateRepositoryRelativeFilePath = value => {
  const path = normalizeFileUpdatePath(value)

  if (!path) {
    return { ok: false, reason: 'File path is required.' }
  }

  if (path.startsWith('/')) {
    return {
      ok: false,
      reason: 'File path must be repository-relative (no leading slash).',
    }
  }

  if (path.endsWith('/')) {
    return { ok: false, reason: 'File path must include a filename (no trailing slash).' }
  }

  const segments = path.split('/').filter(Boolean)
  if (segments.some(segment => segment === '..')) {
    return { ok: false, reason: 'File path cannot include parent directory traversal.' }
  }

  if (!/^[A-Za-z0-9._\-/]+$/.test(path)) {
    return {
      ok: false,
      reason:
        'File path contains unsupported characters. Use letters, numbers, ., _, -, and / only.',
    }
  }

  if (segments.length === 0 || segments.some(segment => segment === '.' || !segment)) {
    return { ok: false, reason: 'File path is invalid.' }
  }

  return { ok: true, value: path }
}

const normalizeFileUpdateInput = (file, index) => {
  if (!file || typeof file !== 'object') {
    throw new Error(`File update at index ${index} must be an object.`)
  }

  const validation = validateRepositoryRelativeFilePath(file.path)
  if (!validation.ok) {
    const rawPath = typeof file.path === 'string' ? file.path : ''
    throw new Error(
      `Invalid file update path at index ${index}: ${rawPath || '(missing path)'} (${validation.reason})`,
    )
  }

  return {
    path: validation.value,
    content: typeof file.content === 'string' ? file.content : '',
  }
}

const toUniqueFileUpdatesByPath = files => {
  if (!Array.isArray(files) || files.length === 0) {
    return []
  }

  const updatesByPath = new Map()
  for (const [index, file] of files.entries()) {
    const normalized = normalizeFileUpdateInput(file, index)

    updatesByPath.set(normalized.path, normalized)
  }

  return [...updatesByPath.values()]
}

const getCommitTreeSha = async ({ token, owner, repo, commitSha, signal }) => {
  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: `/git/commits/${commitSha}` }),
    signal,
  })

  const treeSha = response?.tree?.sha
  if (typeof treeSha !== 'string' || !treeSha) {
    throw new Error(`Could not resolve tree SHA for commit ${commitSha}.`)
  }

  return treeSha
}

const createRepositoryTree = async ({
  token,
  owner,
  repo,
  baseTreeSha,
  files,
  signal,
}) => {
  const tree = files.map(file => ({
    path: file.path,
    mode: '100644',
    type: 'blob',
    content: file.content,
  }))

  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: '/git/trees' }),
    method: 'POST',
    body: {
      base_tree: baseTreeSha,
      tree,
    },
    signal,
  })

  const treeSha = response?.sha
  if (typeof treeSha !== 'string' || !treeSha) {
    throw new Error('Could not create repository tree for commit.')
  }

  return treeSha
}

const createRepositoryCommit = async ({
  token,
  owner,
  repo,
  message,
  treeSha,
  parentCommitSha,
  signal,
}) => {
  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: '/git/commits' }),
    method: 'POST',
    body: {
      message,
      tree: treeSha,
      parents: [parentCommitSha],
    },
    signal,
  })

  const commitSha = response?.sha
  if (typeof commitSha !== 'string' || !commitSha) {
    throw new Error('Could not create repository commit.')
  }

  return commitSha
}

const updateBranchReference = async ({ token, owner, repo, branch, sha, signal }) => {
  const ref = encodeURIComponent(`heads/${branch}`)
  await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: `/git/refs/${ref}` }),
    method: 'PATCH',
    body: {
      sha,
      force: false,
    },
    signal,
  })
}

const commitFilesToExistingBranchWithGitDatabaseApi = async ({
  token,
  owner,
  repo,
  branch,
  files,
  commitMessage,
  signal,
}) => {
  const uniqueFiles = toUniqueFileUpdatesByPath(files)
  if (uniqueFiles.length === 0) {
    return []
  }

  const headCommitSha = await getBranchReferenceSha({
    token,
    owner,
    repo,
    branch,
    signal,
  })
  const baseTreeSha = await getCommitTreeSha({
    token,
    owner,
    repo,
    commitSha: headCommitSha,
    signal,
  })
  const treeSha = await createRepositoryTree({
    token,
    owner,
    repo,
    baseTreeSha,
    files: uniqueFiles,
    signal,
  })
  const commitSha = await createRepositoryCommit({
    token,
    owner,
    repo,
    message: commitMessage,
    treeSha,
    parentCommitSha: headCommitSha,
    signal,
  })
  await updateBranchReference({
    token,
    owner,
    repo,
    branch,
    sha: commitSha,
    signal,
  })

  return uniqueFiles.map(file => ({
    path: file.path,
    commitSha,
    created: null,
  }))
}

const isReferenceAlreadyExistsError = error => {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('reference already exists') || message.includes('already exists')
  )
}

const createUniqueBranchReference = async ({
  token,
  owner,
  repo,
  headBranch,
  baseSha,
  signal,
  attempt = 0,
}) => {
  const candidateBranch = attempt === 0 ? headBranch : `${headBranch}-${attempt + 1}`

  try {
    await createBranchReference({
      token,
      owner,
      repo,
      branch: candidateBranch,
      sha: baseSha,
      signal,
    })
    return candidateBranch
  } catch (error) {
    if (!isReferenceAlreadyExistsError(error)) {
      throw error
    }

    if (attempt >= 4) {
      throw new Error(
        `Branch ${headBranch} already exists. Choose another branch name and retry.`,
        {
          cause: error,
        },
      )
    }

    return createUniqueBranchReference({
      token,
      owner,
      repo,
      headBranch,
      baseSha,
      signal,
      attempt: attempt + 1,
    })
  }
}

const createEditorContentPullRequest = async ({
  token,
  repository,
  baseBranch,
  headBranch,
  prTitle,
  prBody,
  fileUpdates,
  commitMessage,
  signal,
}) => {
  const owner = repository?.owner
  const repo = repository?.name

  if (typeof owner !== 'string' || !owner || typeof repo !== 'string' || !repo) {
    throw new Error('A valid repository selection is required.')
  }

  const baseSha = await getBranchReferenceSha({
    token,
    owner,
    repo,
    branch: baseBranch,
    signal,
  })

  const nextBranch = await createUniqueBranchReference({
    token,
    owner,
    repo,
    headBranch,
    baseSha,
    signal,
  })

  const committedFileUpdates = await commitEditorContentToExistingBranch({
    token,
    repository,
    branch: nextBranch,
    fileUpdates,
    commitMessage,
    signal,
  })

  const pullRequest = await createRepositoryPullRequest({
    token,
    owner,
    repo,
    title: prTitle,
    body: prBody,
    head: nextBranch,
    base: baseBranch,
    signal,
  })

  return {
    pullRequest,
    branch: nextBranch,
    fileUpdates: committedFileUpdates,
  }
}

const commitEditorContentToExistingBranch = async ({
  token,
  repository,
  branch,
  fileUpdates,
  commitMessage,
  signal,
}) => {
  const owner = repository?.owner
  const repo = repository?.name

  if (typeof owner !== 'string' || !owner || typeof repo !== 'string' || !repo) {
    throw new Error('A valid repository selection is required.')
  }

  if (typeof branch !== 'string' || !branch.trim()) {
    throw new Error('An existing head branch is required.')
  }

  if (!Array.isArray(fileUpdates) || fileUpdates.length === 0) {
    throw new Error('At least one file update is required.')
  }

  return commitFilesToExistingBranchWithGitDatabaseApi({
    token,
    owner,
    repo,
    branch,
    files: fileUpdates,
    commitMessage,
    signal,
  })
}

export { createEditorContentPullRequest, commitEditorContentToExistingBranch }
