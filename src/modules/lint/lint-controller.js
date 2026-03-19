import { createEslintWorkerAdapter } from './eslint/worker-adapter.js'
import { createStylelintWorkerAdapter } from './stylelint/worker-adapter.js'
import { createLintDiagnosticsSummary } from './shared/format.js'
import { createLintWorkerClient } from './shared/worker-client.js'

export const createLintController = ({
  getComponentSource,
  getStylesSource,
  getRenderMode,
  getStyleMode,
  setComponentDiagnostics,
  setStyleDiagnostics,
  setStatus,
}) => {
  const worker = new Worker(new URL('../lint-worker.js', import.meta.url), {
    type: 'module',
  })

  const client = createLintWorkerClient({
    worker,
    timeoutMs: 12000,
  })

  const eslintAdapter = createEslintWorkerAdapter({ client })
  const stylelintAdapter = createStylelintWorkerAdapter({ client })

  const lintComponent = async ({ signal } = {}) => {
    setComponentDiagnostics({
      headline: 'Running ESLint diagnostics...',
      lines: [],
      level: 'muted',
    })
    setStatus('Linting component...', 'pending')

    try {
      const diagnostics = await eslintAdapter.lintComponent({
        source: getComponentSource(),
        renderMode: getRenderMode(),
        signal,
      })

      const summary = createLintDiagnosticsSummary({
        diagnostics,
        okHeadline: 'No ESLint issues found.',
        errorHeadline: 'ESLint reported issues.',
      })

      setComponentDiagnostics(summary)
      setStatus(
        summary.level === 'error'
          ? 'Component lint found issues'
          : 'Component lint complete',
        summary.level === 'error' ? 'error' : 'neutral',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setComponentDiagnostics({
        headline: `ESLint unavailable: ${message}`,
        lines: [],
        level: 'error',
      })
      setStatus('Component lint unavailable', 'error')
    }
  }

  const lintStyles = async ({ signal } = {}) => {
    setStyleDiagnostics({
      headline: 'Running Stylelint diagnostics...',
      lines: [],
      level: 'muted',
    })
    setStatus('Linting styles...', 'pending')

    try {
      const diagnostics = await stylelintAdapter.lintStyles({
        source: getStylesSource(),
        styleMode: getStyleMode(),
        signal,
      })

      const summary = createLintDiagnosticsSummary({
        diagnostics,
        okHeadline: 'No Stylelint issues found.',
        errorHeadline: 'Stylelint reported issues.',
      })

      setStyleDiagnostics(summary)
      setStatus(
        summary.level === 'error' ? 'Styles lint found issues' : 'Styles lint complete',
        summary.level === 'error' ? 'error' : 'neutral',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStyleDiagnostics({
        headline: `Stylelint unavailable: ${message}`,
        lines: [],
        level: 'error',
      })
      setStatus('Styles lint unavailable', 'error')
    }
  }

  const dispose = () => {
    client.dispose()
  }

  return {
    lintComponent,
    lintStyles,
    dispose,
  }
}
