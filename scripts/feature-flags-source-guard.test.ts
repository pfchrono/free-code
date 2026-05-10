import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { expect, test } from 'bun:test'

const BUILD_SCRIPT = join(import.meta.dir, 'build.ts')
const REPO_ROOT = join(import.meta.dir, '..')

type FlagGuard = {
  flag: string
  source: string
}

const FLAG_REQUIRES_SOURCE: FlagGuard[] = [
  { flag: 'MCP_SKILLS', source: 'src/skills/mcpSkills.ts' },
]

function enabledFeaturesFromBuildScript(buildScript: string): Set<string> {
  const enabled = new Set<string>()

  for (const variableName of ['defaultFeatures', 'alwaysOnFeatures']) {
    const match = buildScript.match(new RegExp(`const\\s+${variableName}\\s*=\\s*\\[([\\s\\S]*?)\\]`))
    for (const flag of match?.[1]?.matchAll(/['"]([A-Z0-9_]+)['"]/g) ?? []) {
      enabled.add(flag[1]!)
    }
  }

  return enabled
}

test('build feature flags are not enabled without their source files', () => {
  const buildScript = readFileSync(BUILD_SCRIPT, 'utf-8')
  const enabled = enabledFeaturesFromBuildScript(buildScript)

  for (const { flag, source } of FLAG_REQUIRES_SOURCE) {
    const sourceExists = existsSync(join(REPO_ROOT, source))

    if (enabled.has(flag) && !sourceExists) {
      throw new Error(
        `Feature flag ${flag} is enabled in scripts/build.ts, but its required source file "${source}" does not exist. ` +
          `Either port the source file or keep ${flag} disabled.`,
      )
    }

    expect(true).toBe(true)
  }
})
