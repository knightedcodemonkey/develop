import playwright from 'eslint-plugin-playwright'
import tsParser from '@typescript-eslint/parser'
import htmlPlugin from '@html-eslint/eslint-plugin'

const playwrightConfig = playwright.configs['flat/recommended']
const htmlRecommendedConfig = htmlPlugin.configs['flat/recommended']

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
  {
    ...htmlRecommendedConfig,
    files: ['src/**/*.html'],
  },
  {
    files: ['src/**/*.html'],
    plugins: {
      '@html-eslint': htmlPlugin,
    },
    rules: {
      // Formatting is delegated to Prettier; keep html-eslint focused on semantics and a11y.
      '@html-eslint/indent': 'off',
      '@html-eslint/attrs-newline': 'off',
      '@html-eslint/element-newline': 'off',
      '@html-eslint/no-extra-spacing-attrs': 'off',
      '@html-eslint/require-closing-tags': 'off',
      '@html-eslint/use-baseline': 'off',
      '@html-eslint/require-input-label': 'error',
      '@html-eslint/require-button-type': 'error',
      '@html-eslint/no-accesskey-attrs': 'error',
      '@html-eslint/no-positive-tabindex': 'error',
      '@html-eslint/no-invalid-role': 'error',
      '@html-eslint/no-redundant-role': 'error',
      '@html-eslint/no-abstract-roles': 'error',
      '@html-eslint/no-aria-hidden-body': 'error',
      '@html-eslint/no-aria-hidden-on-focusable': 'error',
    },
  },
]
