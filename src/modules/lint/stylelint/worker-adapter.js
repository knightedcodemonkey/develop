import { createLintRequest, lintEngines, lintScopes } from '../shared/protocol.js'

export const createStylelintWorkerAdapter = ({ client }) => {
  const lintStyles = async ({ source, styleMode, signal }) => {
    const request = createLintRequest({
      engine: lintEngines.stylelint,
      scope: lintScopes.styles,
      source,
      filename:
        styleMode === 'less'
          ? 'styles.less'
          : styleMode === 'sass'
            ? 'styles.scss'
            : styleMode === 'module'
              ? 'styles.module.css'
              : 'styles.css',
      mode: styleMode,
    })

    return client.run(request, { signal })
  }

  return {
    lintStyles,
  }
}
