import { createChatDrawer } from '../chat/drawer.js'

const initializeChatWorkflows = ({
  aiChatToggle,
  aiChatDrawer,
  aiChatClose,
  aiChatPrompt,
  aiChatModel,
  aiChatIncludeEditors,
  aiChatSend,
  aiChatClear,
  aiChatStatus,
  aiChatRepository,
  aiChatMessages,
  aiChatKey,
  aiChatKeyInput,
  aiChatKeyAdd,
  aiChatKeyDelete,
  getSelectedRepository,
  getActiveWorkspaceTabContext,
  getWorkspaceTabContexts,
  applyWorkspaceTabContent,
  scheduleRender,
  getRenderMode,
  getStyleMode,
  getPersistedActivePrContext,
}) => {
  const chatDrawerController = createChatDrawer({
    toggleButton: aiChatToggle,
    drawer: aiChatDrawer,
    closeButton: aiChatClose,
    promptInput: aiChatPrompt,
    modelSelect: aiChatModel,
    includeEditorsContextToggle: aiChatIncludeEditors,
    sendButton: aiChatSend,
    clearButton: aiChatClear,
    statusNode: aiChatStatus,
    repositoryNode: aiChatRepository,
    messagesNode: aiChatMessages,
    keyRoot: aiChatKey,
    keyInput: aiChatKeyInput,
    keyAddButton: aiChatKeyAdd,
    keyDeleteButton: aiChatKeyDelete,
    getSelectedRepository,
    getActiveWorkspaceTabContext,
    getWorkspaceTabContexts,
    applyWorkspaceTabContent,
    scheduleRender,
    getRenderMode,
    getStyleMode,
    getDrawerSide: () => {
      return 'right'
    },
    getPersistedActivePrContext,
  })

  return { chatDrawerController }
}

export { initializeChatWorkflows }
