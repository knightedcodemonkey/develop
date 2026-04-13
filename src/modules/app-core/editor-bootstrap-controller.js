const createEditorBootstrapController = ({
  createCodeMirrorEditor,
  jsxEditor,
  cssEditor,
  getJsxSource,
  getCssSource,
  getStyleEditorLanguage,
  getStyleModeValue,
  getSuppressEditorChangeSideEffects,
  getActiveWorkspaceTab,
  getTabKind,
  getDirtyStateForTabChange,
  workspaceTabsState,
  toWorkspaceSyncedContent,
  renderWorkspaceTabs,
  queueWorkspaceSave,
  maybeRenderFromComponentEditorChange,
  markTypeDiagnosticsStale,
  markComponentLintDiagnosticsStale,
  maybeRender,
  markStylesLintDiagnosticsStale,
  flushWorkspaceSave,
  setJsxCodeEditor,
  setCssCodeEditor,
  setGetJsxSource,
  setGetCssSource,
  editorPool,
  componentEditorPanel,
  stylesEditorPanel,
  loadWorkspaceTabIntoEditor,
  setStatus,
}) => {
  const createEditorHost = textarea => {
    const host = document.createElement('div')
    host.className = 'editor-host'
    textarea.before(host)
    return host
  }

  const initializeCodeEditors = async () => {
    const jsxHost = createEditorHost(jsxEditor)
    const cssHost = createEditorHost(cssEditor)

    let nextJsxEditor = null
    let nextCssEditor = null

    try {
      ;[nextJsxEditor, nextCssEditor] = await Promise.all([
        createCodeMirrorEditor({
          parent: jsxHost,
          value: getJsxSource(),
          language: 'javascript-jsx',
          contentAttributes: {
            'aria-label': 'Component source editor',
            'aria-multiline': 'true',
          },
          onChange: () => {
            if (getSuppressEditorChangeSideEffects()) {
              return
            }
            const activeTab = getActiveWorkspaceTab()
            if (activeTab && getTabKind(activeTab) === 'component') {
              const nextContent = getJsxSource()
              const nextDirtyState = getDirtyStateForTabChange(activeTab, nextContent)
              workspaceTabsState.upsertTab(
                {
                  ...activeTab,
                  content: nextContent,
                  syncedContent: toWorkspaceSyncedContent(activeTab?.syncedContent),
                  isDirty: nextDirtyState,
                  lastModified: Date.now(),
                  isActive: true,
                },
                { emitReason: 'componentEditorChange' },
              )

              if (nextDirtyState !== Boolean(activeTab.isDirty)) {
                renderWorkspaceTabs()
              }
            }
            queueWorkspaceSave()
            maybeRenderFromComponentEditorChange()
            markTypeDiagnosticsStale()
            markComponentLintDiagnosticsStale()
          },
        }),
        createCodeMirrorEditor({
          parent: cssHost,
          value: getCssSource(),
          language: getStyleEditorLanguage(getStyleModeValue()),
          contentAttributes: {
            'aria-label': 'Styles source editor',
            'aria-multiline': 'true',
          },
          onChange: () => {
            if (getSuppressEditorChangeSideEffects()) {
              return
            }
            const activeTab = getActiveWorkspaceTab()
            if (activeTab && getTabKind(activeTab) === 'styles') {
              const nextContent = getCssSource()
              const nextDirtyState = getDirtyStateForTabChange(activeTab, nextContent)
              workspaceTabsState.upsertTab(
                {
                  ...activeTab,
                  content: nextContent,
                  syncedContent: toWorkspaceSyncedContent(activeTab?.syncedContent),
                  isDirty: nextDirtyState,
                  lastModified: Date.now(),
                  isActive: true,
                },
                { emitReason: 'stylesEditorChange' },
              )

              if (nextDirtyState !== Boolean(activeTab.isDirty)) {
                renderWorkspaceTabs()
              }
            }
            queueWorkspaceSave()
            maybeRender()
            markStylesLintDiagnosticsStale()
          },
        }),
      ])
    } catch (error) {
      jsxHost.remove()
      cssHost.remove()
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`Editor fallback: ${message}`, 'neutral')
      return
    }

    setJsxCodeEditor(nextJsxEditor)
    setCssCodeEditor(nextCssEditor)
    setGetJsxSource(() => nextJsxEditor.getValue())
    setGetCssSource(() => nextCssEditor.getValue())
    jsxEditor.classList.add('source-textarea--hidden')
    cssEditor.classList.add('source-textarea--hidden')

    try {
      jsxHost.addEventListener('focusout', event => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !jsxHost.contains(event.relatedTarget)
        ) {
          void flushWorkspaceSave().catch(() => {
            /* Save failures are already surfaced through saver onError. */
          })
        }
      })

      cssHost.addEventListener('focusout', event => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !cssHost.contains(event.relatedTarget)
        ) {
          void flushWorkspaceSave().catch(() => {
            /* Save failures are already surfaced through saver onError. */
          })
        }
      })

      editorPool.register('component', {
        isMounted: () =>
          componentEditorPanel instanceof HTMLElement &&
          !componentEditorPanel.hasAttribute('hidden'),
        mount: () => {
          componentEditorPanel?.removeAttribute('hidden')
        },
        unmount: () => {
          componentEditorPanel?.setAttribute('hidden', '')
        },
      })
      editorPool.register('styles', {
        isMounted: () =>
          stylesEditorPanel instanceof HTMLElement &&
          !stylesEditorPanel.hasAttribute('hidden'),
        mount: () => {
          stylesEditorPanel?.removeAttribute('hidden')
        },
        unmount: () => {
          stylesEditorPanel?.setAttribute('hidden', '')
        },
      })

      const activeWorkspaceTab = getActiveWorkspaceTab()
      if (activeWorkspaceTab) {
        loadWorkspaceTabIntoEditor(activeWorkspaceTab)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`Editor sync warning: ${message}`, 'neutral')
    }
  }

  return {
    initializeCodeEditors,
  }
}

export { createEditorBootstrapController }
