const createEmptyMetadata = () => ({
  declarations: [],
  importCount: 0,
  hasTopLevelJsxExpression: false,
  topLevelJsxExpressionRange: null,
})

const isSourceRange = value =>
  Array.isArray(value) &&
  value.length === 2 &&
  Number.isInteger(value[0]) &&
  Number.isInteger(value[1])

export const collectTopLevelTransformMetadata = ({ source, transformJsxSource }) => {
  if (typeof source !== 'string' || !source.trim()) {
    return createEmptyMetadata()
  }

  if (typeof transformJsxSource !== 'function') {
    return createEmptyMetadata()
  }

  const result = transformJsxSource(source, {
    sourceType: 'module',
    typescript: 'preserve',
    collectTopLevelDeclarations: true,
    collectTopLevelJsxExpression: true,
  })

  return {
    declarations: Array.isArray(result?.declarations) ? result.declarations : [],
    importCount: Array.isArray(result?.imports) ? result.imports.length : 0,
    hasTopLevelJsxExpression: result?.hasTopLevelJsxExpression === true,
    topLevelJsxExpressionRange: isSourceRange(result?.topLevelJsxExpressionRange)
      ? result.topLevelJsxExpressionRange
      : null,
  }
}

export const collectTopLevelDeclarations = input =>
  collectTopLevelTransformMetadata(input).declarations

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
