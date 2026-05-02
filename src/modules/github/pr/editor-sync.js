import { getRepositoryFileContent } from '../api/repository-files.js'

const toSafeText = value => (typeof value === 'string' ? value.trim() : '')

const toNormalizedTabTargetsByPath = tabTargets => {
  const targetsByPath = new Map()
  const sourceTargets = Array.isArray(tabTargets) ? tabTargets : []

  for (const target of sourceTargets) {
    const path = toSafeText(target?.path)
    if (!path) {
      continue
    }

    targetsByPath.set(path, {
      path,
      kind: toSafeText(target?.kind),
    })
  }

  return [...targetsByPath.values()]
}

export const createGitHubPrEditorSyncController = ({ shouldApplySyncResult }) => {
  const shouldApply =
    typeof shouldApplySyncResult === 'function' ? shouldApplySyncResult : () => true

  const syncFromActiveContext = async ({
    token,
    repository,
    activeContext,
    syncTargets,
    signal,
  }) => {
    const owner = toSafeText(repository?.owner)
    const repo = toSafeText(repository?.name)
    const branch = toSafeText(activeContext?.headBranch)
    const normalizedTabTargets = toNormalizedTabTargetsByPath(syncTargets?.tabTargets)

    if (!token || !owner || !repo || !branch || normalizedTabTargets.length === 0) {
      return {
        synced: false,
        syncedTabCount: 0,
        totalTabCount: normalizedTabTargets.length,
      }
    }

    if (
      !shouldApply({
        repository,
        activeContext,
        syncTargets: {
          tabTargets: normalizedTabTargets,
        },
      })
    ) {
      return {
        synced: false,
        syncedTabCount: 0,
        totalTabCount: normalizedTabTargets.length,
      }
    }

    const requestFileContent = path =>
      getRepositoryFileContent({
        token,
        owner,
        repo,
        path,
        ref: branch,
        signal,
      })

    const requestedTargets = await Promise.all(
      normalizedTabTargets.map(async target => {
        const file = await requestFileContent(target.path)
        return {
          ...target,
          content: typeof file?.content === 'string' ? file.content : null,
        }
      }),
    )

    if (signal?.aborted) {
      return {
        synced: false,
        syncedTabCount: 0,
        totalTabCount: normalizedTabTargets.length,
      }
    }

    if (
      !shouldApply({
        repository,
        activeContext,
        syncTargets: {
          tabTargets: requestedTargets,
        },
      })
    ) {
      return {
        synced: false,
        syncedTabCount: 0,
        totalTabCount: normalizedTabTargets.length,
      }
    }

    const syncedTabTargets = requestedTargets
      .filter(target => typeof target.content === 'string')
      .map(target => ({
        kind: target.kind,
        path: target.path,
        content: target.content,
      }))

    const allTargetsSynced = syncedTabTargets.length === normalizedTabTargets.length

    if (!allTargetsSynced) {
      return {
        synced: false,
        syncedTabCount: syncedTabTargets.length,
        totalTabCount: normalizedTabTargets.length,
        syncTargets: {
          tabTargets: normalizedTabTargets,
        },
      }
    }

    return {
      synced: true,
      syncedTabCount: syncedTabTargets.length,
      totalTabCount: normalizedTabTargets.length,
      syncTargets: {
        tabTargets: syncedTabTargets,
      },
    }
  }

  return {
    syncFromActiveContext,
  }
}
