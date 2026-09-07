const toNonEmptyText = value => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

const normalizePath = value =>
  toNonEmptyText(value).replace(/\\/g, '/').replace(/\/+/g, '/')

const normalizeProposalTarget = value => toNonEmptyText(value)

const normalizeTabLanguage = value => toNonEmptyText(value).toLowerCase()

const toTargetKey = value => normalizeProposalTarget(value).toLowerCase()

const getCandidateTabsForTarget = ({ target, tabs }) => {
  const normalizedTarget = normalizeProposalTarget(target)
  const normalizedTargetKey = toTargetKey(target)
  const normalizedTargetPath = normalizePath(target)

  if (!normalizedTarget || !Array.isArray(tabs)) {
    return []
  }

  const byId = tabs.filter(tab => toTargetKey(tab.id) === normalizedTargetKey)
  if (byId.length > 0) {
    return byId
  }

  const byPath = tabs.filter(tab => normalizePath(tab.path) === normalizedTargetPath)
  if (byPath.length > 0) {
    return byPath
  }

  return tabs.filter(tab => toTargetKey(tab.name) === normalizedTargetKey)
}

const resolveWorkspaceTabTarget = ({ target, language, tabs, activeTabId }) => {
  const normalizedTarget = normalizeProposalTarget(target)
  if (!normalizedTarget) {
    return null
  }

  const availableTabs = Array.isArray(tabs) ? tabs : []
  const activeTab = availableTabs.find(tab => tab.id === activeTabId) ?? null

  if (toTargetKey(normalizedTarget) === 'active') {
    return activeTab
  }

  const candidates = getCandidateTabsForTarget({
    target: normalizedTarget,
    tabs: availableTabs,
  })

  if (candidates.length === 0) {
    return null
  }

  const normalizedLanguage = normalizeTabLanguage(language)
  const languageMatches = normalizedLanguage
    ? candidates.filter(tab => normalizeTabLanguage(tab.language) === normalizedLanguage)
    : candidates

  const scopedCandidates = languageMatches.length > 0 ? languageMatches : candidates
  if (scopedCandidates.length === 1) {
    return scopedCandidates[0]
  }

  if (activeTab) {
    const activeCandidate = scopedCandidates.find(tab => tab.id === activeTab.id)
    if (activeCandidate) {
      return activeCandidate
    }
  }

  return scopedCandidates[0]
}

export { resolveWorkspaceTabTarget, toTargetKey }
