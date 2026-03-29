import { getRepositoryFileContent } from './github-api.js'

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

  const syncFromActiveContext = async ({ token, repository, activeContext, signal }) => {
    const owner = toSafeText(repository?.owner)
    const repo = toSafeText(repository?.name)
    const branch = toSafeText(activeContext?.headBranch)
    const componentFilePath = toSafeText(activeContext?.componentFilePath)
    const stylesFilePath = toSafeText(activeContext?.stylesFilePath)

    if (!token || !owner || !repo || !branch || !componentFilePath || !stylesFilePath) {
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
      path: componentFilePath,
      ref: branch,
      signal,
    })

    const stylesRequest =
      stylesFilePath === componentFilePath
        ? componentRequest
        : getRepositoryFileContent({
            token,
            owner,
            repo,
            path: stylesFilePath,
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

    if (stylesFilePath === componentFilePath) {
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
