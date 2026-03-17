import playwright from 'eslint-plugin-playwright'
import tsParser from '@typescript-eslint/parser'

const playwrightConfig = playwright.configs['flat/recommended']

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['playwright/**/*.{ts,tsx,js,jsx}', 'playwright.config.ts'],
    languageOptions: {
      parser: tsParser,
      sourceType: 'module',
      ecmaVersion: 'latest',
    },
    rules: {
      'no-unused-vars': 'error',
    },
  },
  {
    ...playwrightConfig,
    files: ['playwright/**/*.{ts,tsx,js,jsx}'],
  },
]
