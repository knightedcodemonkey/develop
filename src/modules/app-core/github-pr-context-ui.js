export const createGitHubPrContextUiController = ({
  contextState,
  getActivePrContextSyncKey,
  githubPrToggle,
  githubPrToggleLabel,
  githubPrToggleIcon,
  githubPrToggleIconPath,
  componentPrSyncIcon,
  componentPrSyncIconPath,
  stylesPrSyncIcon,
  stylesPrSyncIconPath,
  githubPrContextClose,
  aiChatToggle,
  workspacesToggle,
  githubPrOpenIcon,
  githubPrPushCommitIcon,
  closeChatDrawer,
  closePrDrawer,
  closeWorkspacesDrawer,
}) => {
  const setGitHubPrToggleVisual = mode => {
    if (
      !(githubPrToggle instanceof HTMLButtonElement) ||
      !(githubPrToggleLabel instanceof HTMLElement) ||
      !(githubPrToggleIcon instanceof SVGElement) ||
      !(githubPrToggleIconPath instanceof SVGPathElement)
    ) {
      return
    }

    const isPushCommitMode = mode === 'push-commit'
    const label = isPushCommitMode ? 'Push' : 'Open PR'
    const title = isPushCommitMode
      ? 'Push commit to active pull request branch'
      : 'Open pull request'
    const icon = isPushCommitMode ? githubPrPushCommitIcon : githubPrOpenIcon

    githubPrToggleLabel.textContent = label
    githubPrToggle.title = title
    githubPrToggle.setAttribute('aria-label', title)
    githubPrToggleIcon.setAttribute('viewBox', icon.viewBox)
    githubPrToggleIconPath.setAttribute('d', icon.path)
  }

  const syncEditorPrContextIndicators = shouldShow => {
    const iconNodes = [componentPrSyncIcon, stylesPrSyncIcon]
    const iconPathNodes = [componentPrSyncIconPath, stylesPrSyncIconPath]

    for (const iconPath of iconPathNodes) {
      if (iconPath instanceof SVGPathElement) {
        iconPath.setAttribute('d', githubPrOpenIcon.path)
      }
    }

    for (const icon of iconNodes) {
      if (!(icon instanceof SVGElement)) {
        continue
      }

      icon.setAttribute('viewBox', githubPrOpenIcon.viewBox)
      icon.dataset.visible = shouldShow ? 'true' : 'false'
      icon.toggleAttribute('hidden', !shouldShow)
    }
  }

  const setActivePrContext = activeContext => {
    contextState.activePrContext = activeContext ?? null
    const nextSyncKey = getActivePrContextSyncKey(activeContext)

    if (!nextSyncKey) {
      contextState.activePrEditorSyncKey = ''
      contextState.hasSyncedActivePrEditorContent = false
    } else if (contextState.activePrEditorSyncKey !== nextSyncKey) {
      contextState.activePrEditorSyncKey = nextSyncKey
      contextState.hasSyncedActivePrEditorContent = false
    }

    const hasActiveContext = Boolean(activeContext?.prTitle)
    const shouldShowEditorSyncIndicators =
      hasActiveContext && contextState.hasSyncedActivePrEditorContent

    setGitHubPrToggleVisual(hasActiveContext ? 'push-commit' : 'open-pr')
    syncEditorPrContextIndicators(shouldShowEditorSyncIndicators)

    if (!hasActiveContext) {
      githubPrContextClose?.setAttribute('hidden', '')
      return
    }

    githubPrContextClose?.removeAttribute('hidden')
  }

  const markActivePrEditorContentSynced = () => {
    const hasActiveContext = Boolean(contextState.activePrContext?.prTitle)
    if (!hasActiveContext) {
      return
    }

    contextState.hasSyncedActivePrEditorContent = true
    syncEditorPrContextIndicators(true)
  }

  const syncAiChatTokenVisibility = token => {
    const hasToken = typeof token === 'string' && token.trim().length > 0

    if (hasToken) {
      if (workspacesToggle instanceof HTMLButtonElement) {
        workspacesToggle.disabled = false
      }

      if (aiChatToggle instanceof HTMLElement) {
        aiChatToggle.hidden = false
      }

      if (githubPrToggle instanceof HTMLElement) {
        githubPrToggle.hidden = false
      }
      if (!contextState.activePrContext) {
        if (workspacesToggle instanceof HTMLElement) {
          workspacesToggle.hidden = false
        }
      }

      if (contextState.activePrContext) {
        githubPrContextClose?.removeAttribute('hidden')
      } else {
        githubPrContextClose?.setAttribute('hidden', '')
      }
      return
    }

    if (aiChatToggle instanceof HTMLElement) {
      aiChatToggle.hidden = true
    }
    aiChatToggle?.setAttribute('aria-expanded', 'false')
    if (workspacesToggle instanceof HTMLButtonElement) {
      workspacesToggle.disabled = true
    }
    contextState.activePrContext = null
    contextState.activePrEditorSyncKey = ''
    contextState.hasSyncedActivePrEditorContent = false
    syncEditorPrContextIndicators(false)
    setGitHubPrToggleVisual('open-pr')
    if (githubPrToggle instanceof HTMLElement) {
      githubPrToggle.hidden = true
    }
    githubPrToggle?.setAttribute('aria-expanded', 'false')
    if (workspacesToggle instanceof HTMLElement) {
      workspacesToggle.hidden = true
    }
    workspacesToggle?.setAttribute('aria-expanded', 'false')
    githubPrContextClose?.setAttribute('hidden', '')
    closeChatDrawer?.()
    closePrDrawer?.()
    void closeWorkspacesDrawer?.()
  }

  return {
    markActivePrEditorContentSynced,
    setActivePrContext,
    syncAiChatTokenVisibility,
  }
}
