import { toSafeText } from './common.js'

const normalizeFilePath = value =>
  toSafeText(value).replace(/\\/g, '/').replace(/\/+/g, '/')

const validateFilePath = value => {
  const path = normalizeFilePath(value)

  if (!path) {
    return { ok: false, reason: 'File path is required.' }
  }

  if (path.startsWith('/')) {
    return {
      ok: false,
      reason: 'File path must be repository-relative (no leading slash).',
    }
  }

  if (path.endsWith('/')) {
    return { ok: false, reason: 'File path must include a filename (no trailing slash).' }
  }

  const segments = path.split('/').filter(Boolean)

  if (segments.some(segment => segment === '..')) {
    return { ok: false, reason: 'File path cannot include parent directory traversal.' }
  }

  if (!/^[A-Za-z0-9._\-/]+$/.test(path)) {
    return {
      ok: false,
      reason:
        'File path contains unsupported characters. Use letters, numbers, ., _, -, and / only.',
    }
  }

  if (segments.length === 0 || segments.some(segment => segment === '.' || !segment)) {
    return { ok: false, reason: 'File path is invalid.' }
  }

  return { ok: true, value: path }
}

const normalizeFileCommits = fileCommits => {
  if (!Array.isArray(fileCommits)) {
    return {
      fileCommits: [],
      invalidPaths: [],
    }
  }

  const dedupedByPath = new Map()
  const invalidPathsByKey = new Map()

  for (const item of fileCommits) {
    const pathValidation = validateFilePath(item?.path)
    if (!pathValidation.ok) {
      const rawPath = toSafeText(item?.path)
      const tabLabel = toSafeText(item?.tabLabel)
      const displayPath = rawPath || '(missing path)'
      const key = `${displayPath}|${pathValidation.reason}`

      if (!invalidPathsByKey.has(key)) {
        invalidPathsByKey.set(key, {
          path: displayPath,
          tabLabel,
          reason: pathValidation.reason,
        })
      }

      continue
    }

    dedupedByPath.set(pathValidation.value, {
      path: pathValidation.value,
      content: typeof item?.content === 'string' ? item.content : '',
      tabLabel: toSafeText(item?.tabLabel),
      isEntry: item?.isEntry === true,
    })
  }

  return {
    fileCommits: [...dedupedByPath.values()],
    invalidPaths: [...invalidPathsByKey.values()],
  }
}

const ensureTrailingNewline = value => {
  if (typeof value !== 'string' || value.length === 0 || value.endsWith('\n')) {
    return value
  }

  return `${value}\n`
}

export { ensureTrailingNewline, normalizeFileCommits }
