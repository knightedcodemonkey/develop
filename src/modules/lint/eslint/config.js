export const getEslintLintOptions = ({ renderMode }) => {
  const reactRules =
    renderMode === 'react'
      ? {
          'no-unused-vars': 'warn',
        }
      : {}

  return {
    ignore: false,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
        languageOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          parserOptions: {
            ecmaFeatures: {
              jsx: true,
            },
          },
        },
        rules: {
          'no-undef': 'error',
          'no-unreachable': 'error',
          'no-unused-vars': 'warn',
          ...reactRules,
        },
      },
    ],
  }
}
