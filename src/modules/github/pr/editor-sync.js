import { getRepositoryFileContent } from '../api/repository-files.js'

const toSafeText = value => (typeof value === 'string' ? value.trim() : '')

const toComponentPathFallbacks = path => {
  const normalizedPath = toSafeText(path)
  if (!normalizedPath) {
    return []
  }

  const separatorIndex = normalizedPath.lastIndexOf('/')
  const directory = separatorIndex >= 0 ? normalizedPath.slice(0, separatorIndex + 1) : ''

  const candidateFileNames = ['App.tsx', 'app.tsx', 'App.js', 'app.js']
  const fallbackPaths = candidateFileNames
    .map(candidate => `${directory}${candidate}`)
    .filter(candidate => candidate !== normalizedPath)

  for (const canonicalPath of ['src/components/App.tsx', 'src/components/App.js']) {
    if (canonicalPath !== normalizedPath && !fallbackPaths.includes(canonicalPath)) {
      fallbackPaths.push(canonicalPath)
    }
  }

  return fallbackPaths
}

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

    const requestFileContent = path =>
      getRepositoryFileContent({
        token,
        owner,
        repo,
        path,
        ref: branch,
        signal,
      })

    let resolvedComponentTabPath = componentTabPath
    let resolvedStylesTabPath = stylesTabPath

    const componentRequest = (async () => {
      const primary = await requestFileContent(componentTabPath)
      if (primary) {
        return primary
      }

      const fallbackPaths = toComponentPathFallbacks(componentTabPath)
      const fallbackResults = await Promise.all(
        fallbackPaths.map(async path => ({
          path,
          file: await requestFileContent(path),
        })),
      )
      const fallback = fallbackResults.find(candidate => candidate.file)
      if (fallback?.file) {
        resolvedComponentTabPath = fallback.path
        return fallback.file
      }

      return null
    })()

    const stylesRequest =
      stylesTabPath === componentTabPath
        ? componentRequest
        : requestFileContent(stylesTabPath)

    const [componentFile, stylesFile] = await Promise.all([
      componentRequest,
      stylesRequest,
    ])

    if (stylesTabPath === componentTabPath) {
      resolvedStylesTabPath = resolvedComponentTabPath
    }

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
      syncTargets: {
        tabTargets: [
          { kind: 'component', path: resolvedComponentTabPath },
          { kind: 'styles', path: resolvedStylesTabPath },
        ],
      },
    }
  }

  return {
    syncFromActiveContext,
  }
}
