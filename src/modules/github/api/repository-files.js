import { buildRepoApiUrl, encodePathForApi, requestGitHubJson } from './core.js'

const fromUtf8Base64 = value => {
  const normalizedValue = typeof value === 'string' ? value.replace(/\s+/g, '') : ''
  if (!normalizedValue) {
    return ''
  }

  const decodedBinary = atob(normalizedValue)
  const bytes = Uint8Array.from(decodedBinary, character => character.charCodeAt(0))
  const decoder = new TextDecoder()
  return decoder.decode(bytes)
}

const toUtf8Base64 = value => {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(value)
  const chunkSize = 0x8000
  const chunks = []

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    chunks.push(String.fromCharCode(...chunk))
  }

  return btoa(chunks.join(''))
}

const isMissingShaForExistingFileError = error => {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('sha') &&
    (message.includes('already exists') ||
      message.includes('must be supplied') ||
      message.includes("wasn't supplied") ||
      message.includes('not supplied'))
  )
}

const getBranchReferenceSha = async ({ token, owner, repo, branch, signal }) => {
  const ref = encodeURIComponent(`heads/${branch}`)
  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: `/git/ref/${ref}` }),
    signal,
  })

  const sha = response?.object?.sha
  if (typeof sha !== 'string' || !sha) {
    throw new Error(`Could not resolve SHA for ${owner}/${repo}@${branch}`)
  }

  return sha
}

const createBranchReference = async ({ token, owner, repo, branch, sha, signal }) => {
  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: '/git/refs' }),
    method: 'POST',
    body: {
      ref: `refs/heads/${branch}`,
      sha,
    },
    signal,
  })

  const createdRef = response?.ref
  if (typeof createdRef !== 'string' || !createdRef) {
    throw new Error(`Could not create branch ${branch} in ${owner}/${repo}`)
  }

  return createdRef
}

const getRepositoryFileMetadata = async ({ token, owner, repo, path, ref, signal }) => {
  const encodedPath = encodePathForApi(path)
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: `/contents/${encodedPath}${query}` }),
    signal,
    allowNotFound: true,
  })

  if (!response) {
    return null
  }

  return {
    sha: typeof response.sha === 'string' ? response.sha : null,
  }
}

const getRepositoryFileContent = async ({ token, owner, repo, path, ref, signal }) => {
  const encodedPath = encodePathForApi(path)
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const response = await requestGitHubJson({
    token,
    url: buildRepoApiUrl({ owner, repo, path: `/contents/${encodedPath}${query}` }),
    signal,
    allowNotFound: true,
  })

  if (!response) {
    return null
  }

  return {
    path,
    sha: typeof response.sha === 'string' ? response.sha : null,
    content: fromUtf8Base64(typeof response.content === 'string' ? response.content : ''),
  }
}

const upsertRepositoryFile = async ({
  token,
  owner,
  repo,
  branch,
  path,
  content,
  message,
  signal,
}) => {
  const encodedPath = encodePathForApi(path)
  const existingFile = await getRepositoryFileMetadata({
    token,
    owner,
    repo,
    path,
    ref: branch,
    signal,
  })

  const baseBody = {
    message,
    content: toUtf8Base64(content),
    branch,
  }

  const requestBody = existingFile?.sha
    ? {
        ...baseBody,
        sha: existingFile.sha,
      }
    : baseBody

  try {
    const response = await requestGitHubJson({
      token,
      url: buildRepoApiUrl({ owner, repo, path: `/contents/${encodedPath}` }),
      method: 'PUT',
      body: requestBody,
      signal,
    })

    return {
      path,
      commitSha: typeof response?.commit?.sha === 'string' ? response.commit.sha : null,
      created: !existingFile?.sha,
    }
  } catch (error) {
    if (!isMissingShaForExistingFileError(error) || existingFile?.sha) {
      throw error
    }

    const latestFile = await getRepositoryFileMetadata({
      token,
      owner,
      repo,
      path,
      ref: branch,
      signal,
    })

    if (!latestFile?.sha) {
      throw error
    }

    const response = await requestGitHubJson({
      token,
      url: buildRepoApiUrl({ owner, repo, path: `/contents/${encodedPath}` }),
      method: 'PUT',
      body: {
        ...baseBody,
        sha: latestFile.sha,
      },
      signal,
    })

    return {
      path,
      commitSha: typeof response?.commit?.sha === 'string' ? response.commit.sha : null,
      created: false,
    }
  }
}

export {
  createBranchReference,
  getBranchReferenceSha,
  getRepositoryFileContent,
  getRepositoryFileMetadata,
  upsertRepositoryFile,
}
