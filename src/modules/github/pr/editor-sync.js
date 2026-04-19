import { getRepositoryFileContent } from '../api/repository-files.js'

const toSafeText = value => (typeof value === 'string' ? value.trim() : '')

export const createGitHubPrEditorSyncController = ({
  setComponentSource,
  setStylesSource,
  scheduleRender,
}) => {
  const setComponent =
    typeof setComponentSource === 'function' ? setComponentSource : () => {}
  const setStyles = typeof setStylesSource === 'function' ? setStylesSource : () => {}
  const schedule = typeof scheduleRender === 'function' ? scheduleRender : () => {}

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
    const tabTargets = Array.isArray(syncTargets?.tabTargets)
      ? syncTargets.tabTargets
      : []
    const componentTabPath = toSafeText(
      tabTargets.find(target => toSafeText(target?.kind) === 'component')?.path,
    )
    const stylesTabPath = toSafeText(
      tabTargets.find(target => toSafeText(target?.kind) === 'styles')?.path,
    )

    if (!token || !owner || !repo || !branch || !componentTabPath || !stylesTabPath) {
      return {
        synced: false,
        componentSynced: false,
        stylesSynced: false,
      }
    }

    const componentRequest = getRepositoryFileContent({
      token,
      owner,
      repo,
      path: componentTabPath,
      ref: branch,
      signal,
    })

    const stylesRequest =
      stylesTabPath === componentTabPath
        ? componentRequest
        : getRepositoryFileContent({
            token,
            owner,
            repo,
            path: stylesTabPath,
            ref: branch,
            signal,
          })

    const [componentFile, stylesFile] = await Promise.all([
      componentRequest,
      stylesRequest,
    ])

    if (signal?.aborted) {
      return {
        synced: false,
        componentSynced: false,
        stylesSynced: false,
      }
    }

    let updated = false
    let componentSynced = false
    let stylesSynced = false

    if (componentFile && typeof componentFile.content === 'string') {
      setComponent(componentFile.content)
      updated = true
      componentSynced = true
    }

    if (stylesFile && typeof stylesFile.content === 'string') {
      setStyles(stylesFile.content)
      updated = true
      stylesSynced = true
    }

    if (stylesTabPath === componentTabPath) {
      stylesSynced = componentSynced
    }

    if (updated) {
      schedule()
    }

    return {
      synced: componentSynced && stylesSynced,
      componentSynced,
      stylesSynced,
    }
  }

  return {
    syncFromActiveContext,
  }
}
