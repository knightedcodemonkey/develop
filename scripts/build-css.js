import { access, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from 'lightningcss'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const distStylesFile = resolve(projectRoot, 'dist', 'styles.css')

await access(distStylesFile)

const result = bundle({
  filename: distStylesFile,
  minify: true,
})

await writeFile(distStylesFile, result.code)
