import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

export function resolveHooksDir(cwd = rootDir) {
  const result = Bun.spawnSync(['git', 'rev-parse', '--path-format=absolute', '--git-path', 'hooks'], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr).trim() || 'Failed to resolve git hooks directory')
  }

  return new TextDecoder().decode(result.stdout).trim()
}

export const hooks: Record<string, string> = {
  'pre-commit': `#!/bin/sh
set -eu

if command -v code-review-graph >/dev/null 2>&1; then
  code-review-graph detect-changes --brief || true
fi
`,
  'commit-msg': `#!/bin/sh
set -eu

bun run release:metadata:commit-msg "\$1"
`,
  'post-commit': `#!/bin/sh
set -eu

bun run release:metadata:post-commit
`,
}

export function installHooks(cwd = rootDir) {
  const hooksDir = resolveHooksDir(cwd)

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true })
  }

  rmSync(join(hooksDir, 'prepare-commit-msg'), { force: true })

  for (const [name, content] of Object.entries(hooks)) {
    const hookPath = join(hooksDir, name)
    writeFileSync(hookPath, content)
    chmodSync(hookPath, 0o755)
  }
}

if (import.meta.main) {
  installHooks()
}
