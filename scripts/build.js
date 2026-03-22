import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const env = {
  ...process.env,
  KNIGHTED_PRIMARY_CDN: process.env.KNIGHTED_PRIMARY_CDN ?? 'esm',
}
const run = script => {
  const result = spawnSync(npmCommand, ['run', script], {
    stdio: 'inherit',
    env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

/*
 * Order matters: prepare/create dist first, then mutate assets.
 * Keep HTML minification last after any index.html injection.
 */
run('build:prepare')
run('build:css')
run('build:importmap')
run('build:js')
run('build:html')
