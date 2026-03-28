const collectTransformResultDeclarations = result => {
  if (!result || !Array.isArray(result.declarations)) {
    return []
  }

  return result.declarations
}

export const collectTopLevelDeclarations = ({ source, transformJsxSource }) => {
  if (typeof source !== 'string' || !source.trim()) {
    return []
  }

  if (typeof transformJsxSource !== 'function') {
    return []
  }

  const result = transformJsxSource(source, {
    sourceType: 'module',
    typescript: 'preserve',
    collectTopLevelDeclarations: true,
  })

  return collectTransformResultDeclarations(result)
}

export const isFunctionLikeVariableInitializer = declaration =>
  declaration?.initializerKind === 'arrow-function' ||
  declaration?.initializerKind === 'function-expression' ||
  declaration?.initializerKind === 'class-expression'

export const isFunctionLikeDeclaration = declaration => {
  if (!declaration || typeof declaration !== 'object') {
    return false
  }

  if (declaration.kind === 'function' || declaration.kind === 'class') {
    return true
  }

  if (declaration.kind !== 'variable') {
    return false
  }

  return isFunctionLikeVariableInitializer(declaration)
}

export const hasFunctionLikeDeclarationNamed = ({ declarations, name }) => {
  if (!Array.isArray(declarations) || typeof name !== 'string') {
    return false
  }

  return declarations.some(
    declaration => declaration?.name === name && isFunctionLikeDeclaration(declaration),
  )
}

export const getFunctionLikeDeclarationNames = ({ declarations, excludeNames = [] }) => {
  if (!Array.isArray(declarations)) {
    return []
  }

  const seen = new Set(excludeNames)
  const names = []

  for (const declaration of declarations) {
    if (!declaration || typeof declaration.name !== 'string') {
      continue
    }

    if (seen.has(declaration.name) || !isFunctionLikeDeclaration(declaration)) {
      continue
    }

    seen.add(declaration.name)
    names.push(declaration.name)
  }

  return names
}
