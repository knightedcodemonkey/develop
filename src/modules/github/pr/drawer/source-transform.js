import {
  isFunctionLikeDeclaration,
  isFunctionLikeVariableInitializer,
} from '../../../preview/jsx-top-level-declarations.js'

const mergeWhitespaceAroundRemoval = value => value.replace(/\n{3,}/g, '\n\n')

const isSourceRange = value =>
  Array.isArray(value) &&
  value.length === 2 &&
  Number.isInteger(value[0]) &&
  Number.isInteger(value[1])

const isRemovableAppDeclaration = declaration => {
  if (!declaration || declaration.name !== 'App') {
    return false
  }

  if (!isFunctionLikeDeclaration(declaration)) {
    return false
  }

  if (declaration.kind !== 'variable') {
    return true
  }

  return isFunctionLikeVariableInitializer(declaration)
}

const removeRanges = ({ source, ranges }) => {
  const sortedRanges = ranges.slice().sort((first, second) => second[0] - first[0])
  let output = source

  for (const [start, end] of sortedRanges) {
    if (start < 0 || end < start || end > output.length) {
      continue
    }

    output = `${output.slice(0, start)}${output.slice(end)}`
  }

  return output
}

const stripTopLevelAppWrapper = async ({ source, getTopLevelDeclarations }) => {
  if (typeof source !== 'string' || !source.trim()) {
    return ''
  }

  if (typeof getTopLevelDeclarations !== 'function') {
    return source
  }

  try {
    const declarations = await getTopLevelDeclarations(source)

    if (!Array.isArray(declarations)) {
      return source
    }

    const ranges = declarations
      .filter(isRemovableAppDeclaration)
      .map(declaration => declaration.statementRange)
      .filter(isSourceRange)

    if (ranges.length === 0) {
      return source
    }

    return mergeWhitespaceAroundRemoval(removeRanges({ source, ranges }))
  } catch {
    return source
  }
}

export { stripTopLevelAppWrapper }
