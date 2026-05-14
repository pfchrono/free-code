import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const hooksDir = join(rootDir, '.git', 'hooks')

const hooks: Record<string, string> = {
  'pre-commit': `#!/bin/sh
set -eu

bun run release:metadata:pre-commit

if command -v code-review-graph >/dev/null 2>&1; then
  code-review-graph detect-changes --brief || true
fi
`,
  'prepare-commit-msg': `#!/bin/sh
set -eu

if [ -n "\${2:-}" ] && [ "\$2" = "merge" ]; then
  exit 0
fi

bun run release:metadata:prepare-commit-msg "\$1"
`,
  'post-commit': `#!/bin/sh
set -eu

bun run release:metadata:post-commit
`,
}

if (!existsSync(hooksDir)) {
  mkdirSync(hooksDir, { recursive: true })
}

for (const [name, content] of Object.entries(hooks)) {
  const hookPath = join(hooksDir, name)
  writeFileSync(hookPath, content)
  chmodSync(hookPath, 0o755)
}
