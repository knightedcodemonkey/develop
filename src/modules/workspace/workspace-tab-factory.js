const createWorkspaceTabId = prefix => {
  const seed = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${seed}`
}

const makeUniqueTabPath = ({ basePath, suffix = '', tabs, toNonEmptyWorkspaceText }) => {
  const existingPaths = new Set(
    (Array.isArray(tabs) ? tabs : [])
      .map(tab => toNonEmptyWorkspaceText(tab?.path))
      .filter(Boolean),
  )

  if (!existingPaths.has(basePath)) {
    return basePath
  }

  let attempt = 2
  while (attempt < 500) {
    const candidate = basePath.replace(/(\.[^./]+)$/u, `${suffix || ''}-${attempt}$1`)
    if (!existingPaths.has(candidate)) {
      return candidate
    }
    attempt += 1
  }

  return `${basePath}-${Date.now().toString(36)}`
}

export { createWorkspaceTabId, makeUniqueTabPath }
