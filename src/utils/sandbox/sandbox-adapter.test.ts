import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { setOriginalCwd } from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import { getManagedFilePath } from '../settings/managedPath.js'
import { resetSettingsCache } from '../settings/settingsCache.js'
import { convertToSandboxRuntimeConfig } from './sandbox-adapter.js'

const originalCwd = process.cwd()
const originalEnv = {
  CLAUDE_CODE_MANAGED_SETTINGS_PATH: process.env.CLAUDE_CODE_MANAGED_SETTINGS_PATH,
  FREE_CODE_CONFIG_DIR: process.env.FREE_CODE_CONFIG_DIR,
  USER_TYPE: process.env.USER_TYPE,
}
let tempDir: string | undefined

function resetCaches(): void {
  ;(getClaudeConfigHomeDir.cache as Map<unknown, unknown>).clear()
  ;(getManagedFilePath.cache as Map<unknown, unknown>).clear()
  resetSettingsCache()
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'free-code-sandbox-test-'))
  process.env.FREE_CODE_CONFIG_DIR = join(tempDir, 'config')
  setOriginalCwd(join(tempDir, 'project'))
  resetCaches()
})

afterEach(() => {
  setOriginalCwd(originalCwd)
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  resetCaches()
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

describe('convertToSandboxRuntimeConfig', () => {
  it('maps Read allow rules into sandbox allowRead paths', () => {
    const configDir = process.env.FREE_CODE_CONFIG_DIR!
    mkdirSync(configDir, { recursive: true })
    writeFileSync(
      join(configDir, 'settings.json'),
      JSON.stringify({
        permissions: {
          deny: ['Read(/secrets/**)'],
          allow: ['Read(/secrets/public/**)'],
        },
      }),
    )
    resetSettingsCache()

    const config = convertToSandboxRuntimeConfig({})

    expect(config.filesystem.denyRead).toContain(
      join(configDir, 'secrets/**'),
    )
    expect(config.filesystem.allowRead).toContain(
      join(configDir, 'secrets/public/**'),
    )
  })

  it('keeps user Read allow rules out when managed read paths are locked', () => {
    const configDir = process.env.FREE_CODE_CONFIG_DIR!
    const managedDir = join(tempDir!, 'managed')
    process.env.USER_TYPE = 'ant'
    process.env.CLAUDE_CODE_MANAGED_SETTINGS_PATH = managedDir
    resetCaches()

    mkdirSync(configDir, { recursive: true })
    mkdirSync(managedDir, { recursive: true })
    writeFileSync(
      join(configDir, 'settings.json'),
      JSON.stringify({
        permissions: {
          allow: ['Read(/user-safe/**)'],
        },
      }),
    )
    writeFileSync(
      join(managedDir, 'managed-settings.json'),
      JSON.stringify({
        sandbox: {
          filesystem: {
            allowManagedReadPathsOnly: true,
          },
        },
        permissions: {
          allow: ['Read(/policy-safe/**)'],
        },
      }),
    )
    resetSettingsCache()

    const config = convertToSandboxRuntimeConfig({})

    expect(config.filesystem.allowRead).not.toContain(
      join(configDir, 'user-safe/**'),
    )
    expect(config.filesystem.allowRead).toContain(
      join(tempDir!, 'project', 'policy-safe/**'),
    )
  })
})
