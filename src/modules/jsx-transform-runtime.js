const transformLoaderPromiseByImporter = new WeakMap()

export const ensureJsxTransformSource = async ({
  cdnImports,
  importFromCdnWithFallback,
}) => {
  if (typeof importFromCdnWithFallback !== 'function') {
    throw new Error('importFromCdnWithFallback must be a function.')
  }

  const cachedPromise = transformLoaderPromiseByImporter.get(importFromCdnWithFallback)
  if (cachedPromise) {
    return cachedPromise
  }

  const nextPromise = importFromCdnWithFallback(cdnImports.jsxTransform)
    .then(loaded => {
      const transformJsxSource = loaded.module?.transformJsxSource

      if (typeof transformJsxSource !== 'function') {
        throw new Error(`transformJsxSource export was not found from ${loaded.url}`)
      }

      return transformJsxSource
    })
    .catch(error => {
      transformLoaderPromiseByImporter.delete(importFromCdnWithFallback)
      throw error
    })

  transformLoaderPromiseByImporter.set(importFromCdnWithFallback, nextPromise)
  return nextPromise
}
