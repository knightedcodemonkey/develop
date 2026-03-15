import { spawnSync } from 'node:child_process'

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const primaryCdn = process.env.KNIGHTED_PRIMARY_CDN ?? 'importMap'

if (primaryCdn !== 'importMap') {
  process.stderr.write(
    `[build-importmap] Skipping import-map generation for primary CDN: ${primaryCdn}.\n`,
  )
  process.exit(0)
}

const commonArgs = [
  'jspm',
  'link',
  '--map',
  './dist/index.html',
  '--out',
  './dist/index.html',
  '--provider',
  'jspm.io',
  '--release',
  '--integrity',
  '--preload=static',
  '--resolution',
  'sass=1.93.2,less=4.4.2',
  './dist/prod-imports.js',
]

const linkResult = spawnSync(npxCommand, commonArgs, {
  stdio: 'inherit',
  encoding: 'utf8',
})

if (linkResult.status === 0) {
  process.exit(0)
}

process.exit(linkResult.status ?? 1)
