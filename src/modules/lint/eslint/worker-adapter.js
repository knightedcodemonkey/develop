import { createLintRequest, lintEngines, lintScopes } from '../shared/protocol.js'

export const createEslintWorkerAdapter = ({ client }) => {
  const lintComponent = async ({ source, renderMode, signal }) => {
    const request = createLintRequest({
      engine: lintEngines.eslint,
      scope: lintScopes.component,
      source,
      filename: 'component.tsx',
      mode: renderMode,
    })

    return client.run(request, { signal })
  }

  return {
    lintComponent,
  }
}
