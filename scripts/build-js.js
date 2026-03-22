import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const distDir = resolve(projectRoot, 'dist')
const collectJavaScriptFiles = async directory => {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async entry => {
      const fullPath = resolve(directory, entry.name)

      if (entry.isDirectory()) {
        return collectJavaScriptFiles(fullPath)
      }

      if (!entry.isFile()) {
        return []
      }

      if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        return [fullPath]
      }

      return []
    }),
  )

  return nested.flat()
}
let distStats

try {
  distStats = await stat(distDir)
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    throw new Error('dist directory is missing. Run build:prepare first.', {
      cause: error,
    })
  }

  throw error
}

if (!distStats.isDirectory()) {
  throw new Error('dist directory is missing. Run build:prepare first.')
}

const scriptFiles = await collectJavaScriptFiles(distDir)

await Promise.all(
  scriptFiles.map(async filePath => {
    const source = await readFile(filePath, 'utf8')
    const result = await transform(source, {
      loader: 'js',
      minifySyntax: true,
      minifyWhitespace: true,
      minifyIdentifiers: false,
      charset: 'utf8',
    })

    await writeFile(filePath, result.code)
  }),
)
