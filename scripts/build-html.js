import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { minify } from 'html-minifier-terser'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const distIndexHtml = resolve(projectRoot, 'dist', 'index.html')

await access(distIndexHtml)

const html = await readFile(distIndexHtml, 'utf8')

const minifiedHtml = await minify(html, {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeEmptyAttributes: false,
  minifyCSS: true,
})

await writeFile(distIndexHtml, minifiedHtml)
