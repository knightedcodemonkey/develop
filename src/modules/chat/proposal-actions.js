import { toMessageEditorProposals } from './proposals.js'
import { resolveWorkspaceTabTarget } from './tab-target-resolver.js'
import { createTabScopedUndoState } from './tab-scoped-undo-state.js'

const preserveTrailingNewlineIfNeeded = ({ previousValue, nextValue }) => {
  if (typeof previousValue !== 'string' || typeof nextValue !== 'string') {
    return nextValue
  }

  if (!previousValue.endsWith('\n') || nextValue.endsWith('\n')) {
    return nextValue
  }

  return `${nextValue}\n`
}

export const createChatProposalActions = ({
  getActiveTabContext,
  getWorkspaceTabs,
  applyWorkspaceTabContent,
  scheduleRenderAfterEditorUpdate,
  setChatStatus,
}) => {
  const tabScopedUndoState = createTabScopedUndoState()

  const getFallbackProposalTarget = () => {
    const activeTabContext = getActiveTabContext()
    if (!activeTabContext) {
      return ''
    }

    return activeTabContext.path || activeTabContext.id
  }

  const resetChatContextState = messages => {
    tabScopedUndoState.clearAll()

    if (!Array.isArray(messages)) {
      return
    }

    for (const message of messages) {
      if (!message || typeof message !== 'object') {
        continue
      }

      message.appliedTargets = null
    }
  }

  const resolveMessageProposals = message => {
    const proposals = toMessageEditorProposals(message, {
      fallbackTarget: getFallbackProposalTarget(),
      allowMarkdownFallback: message?.allowApplyActions === true,
    })
    const workspaceTabs = getWorkspaceTabs()
    const activeTabId = getActiveTabContext()?.id || ''

    return proposals
      .map((proposal, proposalOriginalIndex) => {
        const resolvedTab = resolveWorkspaceTabTarget({
          target: proposal.target,
          language: proposal.language,
          tabs: workspaceTabs,
          activeTabId,
        })

        if (!resolvedTab) {
          return null
        }

        return {
          ...proposal,
          proposalOriginalIndex,
          appliedKey: resolvedTab.id,
          resolvedTab,
        }
      })
      .filter(Boolean)
  }

  const applyProposalToTab = ({ messages, messageIndex, proposalOriginalIndex }) => {
    const message = Array.isArray(messages) ? messages[messageIndex] : null
    if (!message || message.role !== 'assistant') {
      return null
    }

    const proposals = toMessageEditorProposals(message, {
      fallbackTarget: getFallbackProposalTarget(),
      allowMarkdownFallback: message?.allowApplyActions === true,
    })
    const proposal = proposals[proposalOriginalIndex]
    if (!proposal) {
      return null
    }

    const activeTabContext = getActiveTabContext()
    const workspaceTabs = getWorkspaceTabs()
    const resolvedTab = resolveWorkspaceTabTarget({
      target: proposal.target,
      language: proposal.language,
      tabs: workspaceTabs,
      activeTabId: activeTabContext?.id || '',
    })

    if (!resolvedTab || typeof applyWorkspaceTabContent !== 'function') {
      return null
    }

    const previousValue =
      typeof resolvedTab.content === 'string' ? resolvedTab.content : ''
    const nextValue = preserveTrailingNewlineIfNeeded({
      previousValue,
      nextValue: proposal.content,
    })

    const updatedTab = applyWorkspaceTabContent({
      tabId: resolvedTab.id,
      content: nextValue,
    })
    if (!updatedTab) {
      return null
    }

    tabScopedUndoState.setSnapshot({
      tabId: resolvedTab.id,
      snapshot: {
        previousValue,
        tabName: resolvedTab.name,
      },
    })

    scheduleRenderAfterEditorUpdate?.()
    const tabLabel = resolvedTab.name || resolvedTab.path || resolvedTab.id
    setChatStatus?.(`Applied assistant proposal to ${tabLabel}.`, 'ok')
    return {
      appliedKey: resolvedTab.id,
      tabId: resolvedTab.id,
    }
  }

  const getActiveTabUndoState = () => {
    const activeTabContext = getActiveTabContext()
    const activeTabId = activeTabContext?.id
    if (!activeTabId) {
      return null
    }

    const snapshot = tabScopedUndoState.getSnapshot(activeTabId)
    if (!snapshot) {
      return null
    }

    return {
      activeTabContext,
      snapshot,
    }
  }

  const undoActiveTabApply = () => {
    if (typeof applyWorkspaceTabContent !== 'function') {
      return false
    }

    const activeUndoState = getActiveTabUndoState()
    if (!activeUndoState) {
      return false
    }

    const { activeTabContext, snapshot } = activeUndoState
    const activeTabId = activeTabContext.id

    const restored = applyWorkspaceTabContent({
      tabId: activeTabId,
      content: snapshot.previousValue,
    })
    if (!restored) {
      return false
    }

    tabScopedUndoState.clearSnapshot(activeTabId)
    scheduleRenderAfterEditorUpdate?.()
    const tabLabel = activeTabContext.name || snapshot.tabName || 'active tab'
    setChatStatus?.(`Reverted last apply for ${tabLabel}.`, 'neutral')
    return true
  }

  return {
    applyProposalToTab,
    getActiveTabUndoState,
    resolveMessageProposals,
    resetChatContextState,
    undoActiveTabApply,
  }
}
