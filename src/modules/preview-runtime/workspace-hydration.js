const isImportRange = range =>
  Array.isArray(range) &&
  range.length === 2 &&
  Number.isInteger(range[0]) &&
  Number.isInteger(range[1])

export const toModuleSpecifierKey = value => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

export const toTabModuleKey = tab => {
  if (!tab || typeof tab !== 'object') {
    return ''
  }

  if (typeof tab.path === 'string' && tab.path.trim().length > 0) {
    return toModuleSpecifierKey(tab.path)
  }

  if (typeof tab.name === 'string' && tab.name.trim().length > 0) {
    return toModuleSpecifierKey(tab.name)
  }

  return typeof tab.id === 'string' ? toModuleSpecifierKey(tab.id) : ''
}

export const isRelativeSpecifier = specifier =>
  typeof specifier === 'string' &&
  (specifier.startsWith('./') || specifier.startsWith('../'))

const getImportRangesToStrip = ({ imports, shouldStrip }) =>
  imports
    .filter(entry => shouldStrip(entry))
    .map(entry => entry?.range)
    .filter(isImportRange)
    .slice()
    .sort((first, second) => second[0] - first[0])

export const stripImportDeclarationsBy = (code, imports, shouldStrip) => {
  const ranges = getImportRangesToStrip({ imports, shouldStrip })
  let output = code

  for (const [start, end] of ranges) {
    if (start < 0 || end < start || end > output.length) {
      continue
    }

    output = `${output.slice(0, start)}${output.slice(end)}`
  }

  return output
}
