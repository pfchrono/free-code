import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setOriginalCwd } from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import {
  getRelativeSettingsFilePathForSource,
  getSettingsFilePathForSource,
  getSettingsForSource,
  updateSettingsForSource,
} from './settings.js'
import { resetSettingsCache } from './settingsCache.js'

const originalEnv = {
  FREE_CODE_CONFIG_DIR: process.env.FREE_CODE_CONFIG_DIR,
  FREE_CODE_CONFIG_HOME: process.env.FREE_CODE_CONFIG_HOME,
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  CLAUDE_CONFIG_HOME: process.env.CLAUDE_CONFIG_HOME,
  FREE_CODE_LEGACY_CONFIG_DIR: process.env.FREE_CODE_LEGACY_CONFIG_DIR,
}
const originalCwd = process.cwd()

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  ;(getClaudeConfigHomeDir.cache as Map<unknown, unknown>).clear()
  resetSettingsCache()
  setOriginalCwd(originalCwd)
}

afterEach(restoreEnv)

describe('Free-Code settings migration', () => {
  test('uses .free-code for project and local settings paths', () => {
    expect(getRelativeSettingsFilePathForSource('projectSettings')).toBe(
      join('.free-code', 'settings.json'),
    )
    expect(getRelativeSettingsFilePathForSource('localSettings')).toBe(
      join('.free-code', 'settings.local.json'),
    )
  })

  test('FREE_CODE_CONFIG_DIR takes precedence over legacy CLAUDE_CONFIG_DIR', () => {
    const home = mkdtempSync(join(tmpdir(), 'free-code-env-precedence-'))
    const freeCodeDir = join(home, '.free-code-primary')
    const legacyDir = join(home, '.claude-legacy')
    process.env.FREE_CODE_CONFIG_DIR = freeCodeDir
    process.env.CLAUDE_CONFIG_DIR = legacyDir
    delete process.env.FREE_CODE_CONFIG_HOME
    delete process.env.CLAUDE_CONFIG_HOME
    ;(getClaudeConfigHomeDir.cache as Map<unknown, unknown>).clear()

    expect(getClaudeConfigHomeDir()).toBe(freeCodeDir)

    rmSync(home, { recursive: true, force: true })
  })

  test('imports legacy global settings from ~/.claude when ~/.free-code is empty', () => {
    const home = mkdtempSync(join(tmpdir(), 'free-code-settings-home-'))
    const freeCodeDir = join(home, '.free-code')
    const legacyDir = join(home, '.claude')
    process.env.FREE_CODE_CONFIG_DIR = freeCodeDir
    process.env.FREE_CODE_LEGACY_CONFIG_DIR = legacyDir
    delete process.env.CLAUDE_CONFIG_DIR
    ;(getClaudeConfigHomeDir.cache as Map<unknown, unknown>).clear()
    resetSettingsCache()

    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(
      join(legacyDir, 'settings.json'),
      JSON.stringify({ model: 'gpt-5.4' }),
      { flag: 'wx' },
    )

    const imported = getSettingsForSource('userSettings')
    expect(imported?.model).toBe('gpt-5.4')
    expect(getSettingsFilePathForSource('userSettings')).toBe(
      join(freeCodeDir, 'settings.json'),
    )

    rmSync(home, { recursive: true, force: true })
  })

  test('imports legacy project and local settings from .claude into .free-code', () => {
    const project = mkdtempSync(join(tmpdir(), 'free-code-settings-project-'))
    setOriginalCwd(project)
    resetSettingsCache()

    mkdirSync(join(project, '.claude'), { recursive: true })
    writeFileSync(
      join(project, '.claude', 'settings.json'),
      JSON.stringify({ model: 'gpt-5.5' }),
      { flag: 'wx' },
    )
    writeFileSync(
      join(project, '.claude', 'settings.local.json'),
      JSON.stringify({ includeGitInstructions: false }),
      { flag: 'wx' },
    )

    expect(getSettingsForSource('projectSettings')?.model).toBe('gpt-5.5')
    expect(getSettingsForSource('localSettings')?.includeGitInstructions).toBe(
      false,
    )

    rmSync(project, { recursive: true, force: true })
  })

  test('writes updated local settings to .free-code instead of .claude', () => {
    const project = mkdtempSync(join(tmpdir(), 'free-code-settings-write-'))
    setOriginalCwd(project)
    resetSettingsCache()

    const result = updateSettingsForSource('localSettings', {
      enabledPlugins: { 'example/plugin': true },
    })

    expect(result.error).toBeNull()
    expect(getSettingsFilePathForSource('localSettings')).toBe(
      join(project, '.free-code', 'settings.local.json'),
    )
    expect(getSettingsForSource('localSettings')?.enabledPlugins).toEqual({
      'example/plugin': true,
    })

    rmSync(project, { recursive: true, force: true })
  })
})
