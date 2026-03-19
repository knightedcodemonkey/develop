const syntaxByDialect = {
  css: undefined,
  module: undefined,
  less: 'postcss-less',
  sass: 'postcss-scss',
}

export const getStylelintLintOptions = ({ source, filename, dialect }) => {
  const customSyntax = syntaxByDialect[dialect]

  return {
    code: source,
    codeFilename: filename,
    customSyntax,
    config: {
      rules: {
        'block-no-empty': true,
        'color-no-invalid-hex': true,
        'declaration-block-no-duplicate-properties': true,
        'property-no-unknown': true,
      },
    },
  }
}
