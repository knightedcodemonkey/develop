import { isTabEditedForDisplay } from './workspace-tab-edited-display.js'

const createWorkspaceTabsRenderer = ({
  workspaceTabsStrip,
  workspaceTabsState,
  getWorkspaceTabRenameState,
  getDraggedWorkspaceTabId,
  setDraggedWorkspaceTabId,
  getDragOverWorkspaceTabId,
  setDragOverWorkspaceTabId,
  getSuppressWorkspaceTabClick,
  setSuppressWorkspaceTabClick,
  getIsRenderingWorkspaceTabs,
  setIsRenderingWorkspaceTabs,
  getHasPendingWorkspaceTabsRender,
  setHasPendingWorkspaceTabsRender,
  setActiveWorkspaceTab,
  persistActiveTabEditorContent,
  queueWorkspaceSave,
  beginWorkspaceTabRename,
  finishWorkspaceTabRename,
  removeWorkspaceTab,
  getWorkspaceTabDisplay,
  getShouldShowEditedDesign,
  workspaceTabsShell,
  workspaceTabAddWrap,
}) => {
  const clearWorkspaceTabDragState = () => {
    setDraggedWorkspaceTabId('')
    setDragOverWorkspaceTabId('')
  }

  const renderWorkspaceTabs = () => {
    if (!(workspaceTabsStrip instanceof HTMLElement)) {
      return
    }

    if (getIsRenderingWorkspaceTabs()) {
      setHasPendingWorkspaceTabsRender(true)
      return
    }

    setIsRenderingWorkspaceTabs(true)

    try {
      const tabs = workspaceTabsState.getTabs()
      const activeTabId = workspaceTabsState.getActiveTabId()
      const shouldShowEditedDesign =
        typeof getShouldShowEditedDesign === 'function'
          ? Boolean(getShouldShowEditedDesign())
          : true

      workspaceTabsStrip.replaceChildren()

      for (const tab of tabs) {
        const isActive = tab.id === activeTabId
        const isRenaming = getWorkspaceTabRenameState().tabId === tab.id
        const isEdited = shouldShowEditedDesign && isTabEditedForDisplay(tab)
        const editedSuffix = isEdited ? ' (Edited)' : ''
        const tabContainer = document.createElement('li')
        tabContainer.className = 'workspace-tab'
        tabContainer.dataset.active = isActive ? 'true' : 'false'
        tabContainer.dataset.tabId = tab.id
        tabContainer.setAttribute(
          'aria-label',
          `Workspace tab ${tab.name}${editedSuffix}`,
        )
        tabContainer.draggable = !isRenaming
        tabContainer.dataset.dragOver =
          getDragOverWorkspaceTabId() && getDragOverWorkspaceTabId() === tab.id
            ? 'true'
            : 'false'
        tabContainer.addEventListener('click', event => {
          if (getSuppressWorkspaceTabClick()) {
            setSuppressWorkspaceTabClick(false)
            return
          }

          const clickTarget = event.target
          if (!(clickTarget instanceof Element)) {
            return
          }

          if (
            clickTarget.closest('.workspace-tab__rename, .workspace-tab__remove, input')
          ) {
            return
          }

          setActiveWorkspaceTab(tab.id)
        })
        if (!isRenaming) {
          tabContainer.addEventListener('dragstart', event => {
            setDraggedWorkspaceTabId(tab.id)
            setDragOverWorkspaceTabId('')
            setSuppressWorkspaceTabClick(true)
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', tab.id)
            }
          })
          tabContainer.addEventListener('dragend', () => {
            clearWorkspaceTabDragState()
            queueMicrotask(() => {
              setSuppressWorkspaceTabClick(false)
            })
            renderWorkspaceTabs()
          })
          tabContainer.addEventListener('dragover', event => {
            if (!getDraggedWorkspaceTabId() || getDraggedWorkspaceTabId() === tab.id) {
              return
            }

            event.preventDefault()
            if (event.dataTransfer) {
              event.dataTransfer.dropEffect = 'move'
            }

            if (getDragOverWorkspaceTabId() !== tab.id) {
              setDragOverWorkspaceTabId(tab.id)
              tabContainer.dataset.dragOver = 'true'
            }
          })
          tabContainer.addEventListener('dragleave', event => {
            const relatedTarget = event.relatedTarget
            if (relatedTarget instanceof Node && tabContainer.contains(relatedTarget)) {
              return
            }

            if (getDragOverWorkspaceTabId() === tab.id) {
              setDragOverWorkspaceTabId('')
              tabContainer.dataset.dragOver = 'false'
            }
          })
          tabContainer.addEventListener('drop', event => {
            event.preventDefault()

            if (!getDraggedWorkspaceTabId() || getDraggedWorkspaceTabId() === tab.id) {
              clearWorkspaceTabDragState()
              renderWorkspaceTabs()
              return
            }

            persistActiveTabEditorContent()

            const moved = workspaceTabsState.moveTabBefore(
              getDraggedWorkspaceTabId(),
              tab.id,
            )
            clearWorkspaceTabDragState()
            renderWorkspaceTabs()

            if (!moved) {
              return
            }

            queueWorkspaceSave()
          })
        }

        if (isRenaming) {
          const renameInput = document.createElement('input')
          renameInput.className = 'workspace-tab__name-input'
          renameInput.value = tab.path || tab.name
          renameInput.setAttribute('aria-label', `Rename ${tab.name}`)

          let renameResolved = false
          const resolveRename = ({ cancelled = false } = {}) => {
            if (renameResolved) {
              return
            }

            renameResolved = true
            finishWorkspaceTabRename({
              tabId: tab.id,
              nextName: renameInput.value,
              cancelled,
            })
          }

          renameInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              resolveRename()
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              resolveRename({ cancelled: true })
            }
          })
          renameInput.addEventListener('blur', () => {
            resolveRename()
          })
          tabContainer.append(renameInput)
          workspaceTabsStrip.append(tabContainer)

          queueMicrotask(() => {
            renameInput.focus()
            renameInput.select()
          })
          continue
        }

        const selectButton = document.createElement('button')
        selectButton.className = 'workspace-tab__select'
        selectButton.type = 'button'
        const tabDisplay = getWorkspaceTabDisplay(tab)
        if (tabDisplay.fullPath) {
          selectButton.title = tabDisplay.fullPath
        }

        const fileNameNode = document.createElement('span')
        fileNameNode.className = 'workspace-tab__path-file'
        fileNameNode.textContent = tabDisplay.fileName || tab.name
        selectButton.append(fileNameNode)

        if (isActive) {
          selectButton.setAttribute('aria-current', 'true')
        } else {
          selectButton.removeAttribute('aria-current')
        }
        selectButton.setAttribute('aria-label', `Open tab ${tab.name}${editedSuffix}`)
        selectButton.addEventListener('click', event => {
          event.stopPropagation()
          setActiveWorkspaceTab(tab.id)
        })
        selectButton.addEventListener('dblclick', () => {
          beginWorkspaceTabRename(tab.id)
        })
        tabContainer.append(selectButton)

        if (tab.role === 'entry') {
          const metaBadge = document.createElement('span')
          metaBadge.className = 'workspace-tab__meta'
          metaBadge.textContent = 'Entry'
          tabContainer.append(metaBadge)
        }

        if (shouldShowEditedDesign && isTabEditedForDisplay(tab)) {
          const dirtyBadge = document.createElement('span')
          dirtyBadge.className = 'workspace-tab__dirty-indicator'
          dirtyBadge.setAttribute('aria-hidden', 'true')
          tabContainer.append(dirtyBadge)
        }

        const renameButton = document.createElement('button')
        renameButton.className = 'workspace-tab__rename'
        renameButton.type = 'button'
        renameButton.setAttribute('aria-label', `Rename tab ${tab.name}`)
        renameButton.title = `Rename ${tab.name}`
        const renameIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        renameIcon.setAttribute('viewBox', '0 0 24 24')
        renameIcon.setAttribute('aria-hidden', 'true')
        const renamePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        renamePath.setAttribute(
          'd',
          'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
        )
        renameIcon.append(renamePath)
        renameButton.append(renameIcon)
        renameButton.addEventListener('click', () => {
          beginWorkspaceTabRename(tab.id)
        })
        tabContainer.append(renameButton)

        if (tab.role !== 'entry') {
          const removeButton = document.createElement('button')
          removeButton.className = 'workspace-tab__remove'
          removeButton.type = 'button'
          removeButton.textContent = '×'
          removeButton.setAttribute('aria-label', `Remove tab ${tab.name}`)
          removeButton.title = `Remove ${tab.name}`
          removeButton.addEventListener('click', () => {
            removeWorkspaceTab(tab.id)
          })
          tabContainer.append(removeButton)
        }

        workspaceTabsStrip.append(tabContainer)
      }

      if (
        workspaceTabAddWrap instanceof HTMLElement &&
        workspaceTabsShell instanceof HTMLElement
      ) {
        workspaceTabsShell.append(workspaceTabAddWrap)
      }
    } finally {
      setIsRenderingWorkspaceTabs(false)
    }

    if (getHasPendingWorkspaceTabsRender()) {
      setHasPendingWorkspaceTabsRender(false)
      renderWorkspaceTabs()
      return
    }
  }

  return {
    clearWorkspaceTabDragState,
    renderWorkspaceTabs,
  }
}

export { createWorkspaceTabsRenderer }
