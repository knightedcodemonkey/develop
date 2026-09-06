const toNonEmptyText = value => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

const toCodeFenceLanguage = language => {
  const normalizedLanguage = toNonEmptyText(language).toLowerCase()

  if (normalizedLanguage.includes('less')) {
    return 'less'
  }

  if (normalizedLanguage.includes('sass')) {
    return 'sass'
  }

  if (normalizedLanguage.includes('scss')) {
    return 'scss'
  }

  if (normalizedLanguage.includes('css')) {
    return 'css'
  }

  if (normalizedLanguage.includes('tsx')) {
    return 'tsx'
  }

  if (normalizedLanguage.includes('typescript')) {
    return 'ts'
  }

  if (normalizedLanguage.includes('jsx')) {
    return 'jsx'
  }

  if (normalizedLanguage.includes('javascript')) {
    return 'js'
  }

  return 'javascript'
}

const normalizeWorkspaceTabContext = value => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const tabId = toNonEmptyText(value.id)
  if (!tabId) {
    return null
  }

  return {
    id: tabId,
    name: toNonEmptyText(value.name),
    path: toNonEmptyText(value.path),
    language: toNonEmptyText(value.language),
    content: typeof value.content === 'string' ? value.content : '',
    isActive: Boolean(value.isActive),
  }
}

const normalizeWorkspaceTabContexts = values => {
  if (!Array.isArray(values)) {
    return []
  }

  const uniqueTabs = new Map()

  for (const tabValue of values) {
    const normalizedTab = normalizeWorkspaceTabContext(tabValue)
    if (!normalizedTab) {
      continue
    }

    uniqueTabs.set(normalizedTab.id, normalizedTab)
  }

  return Array.from(uniqueTabs.values())
}

const buildTabReference = tabContext => {
  const tabName = toNonEmptyText(tabContext?.name)
  const tabPath = toNonEmptyText(tabContext?.path)
  return [tabName, tabPath].filter(Boolean).join(' - ') || 'active tab'
}

const buildActiveTabEditorContext = ({
  activeTabContext,
  workspaceTabContexts,
  renderMode,
  styleMode,
}) => {
  if (!activeTabContext) {
    return null
  }

  const tabReference = buildTabReference(activeTabContext)
  const codeFenceLanguage = toCodeFenceLanguage(activeTabContext.language)
  const visibleTabs = normalizeWorkspaceTabContexts(workspaceTabContexts)
    .slice(0, 20)
    .map(tab => {
      const tabPath = toNonEmptyText(tab.path) || '(no-path)'
      const tabName = toNonEmptyText(tab.name) || tab.id
      const tabLanguage = toNonEmptyText(tab.language) || 'plaintext'
      return `- id=${tab.id} | path=${tabPath} | name=${tabName} | language=${tabLanguage}`
    })

  return [
    'Editor context:',
    `- Render mode: ${toNonEmptyText(renderMode) || 'unknown'}`,
    `- Style mode: ${toNonEmptyText(styleMode) || 'unknown'}`,
    `- Active tab: ${tabReference}`,
    '- If proposing concrete editor changes, prefer tool calls over plain text.',
    '- For propose_editor_update, set target to a tab id or path from the available targets list.',
    '- Use the optional language field when target text could match more than one tab.',
    '',
    'Available tab targets (id and path):',
    ...(visibleTabs.length > 0 ? visibleTabs : ['- (none)']),
    '',
    'Active tab source:',
    `\`\`\`${codeFenceLanguage}`,
    activeTabContext.content || '(empty)',
    '```',
  ].join('\n')
}

export {
  buildActiveTabEditorContext,
  normalizeWorkspaceTabContext,
  normalizeWorkspaceTabContexts,
}
