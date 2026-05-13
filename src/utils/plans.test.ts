import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'path'
import { getDefaultPlansDirectory } from './plans.js'

const ORIGINAL_ENV = {
  FREE_CODE_CONFIG_DIR: process.env.FREE_CODE_CONFIG_DIR,
  FREE_CODE_CONFIG_HOME: process.env.FREE_CODE_CONFIG_HOME,
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  CLAUDE_CONFIG_HOME: process.env.CLAUDE_CONFIG_HOME,
}

function restoreEnv(): void {
  for (const key of Object.keys(ORIGINAL_ENV) as Array<keyof typeof ORIGINAL_ENV>) {
    const value = ORIGINAL_ENV[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

describe('getDefaultPlansDirectory', () => {
  afterEach(() => {
    restoreEnv()
  })

  test('uses Free-Code config directory plus plans', () => {
    process.env.FREE_CODE_CONFIG_DIR = '/tmp/free-code-config'
    delete process.env.FREE_CODE_CONFIG_HOME
    delete process.env.CLAUDE_CONFIG_DIR
    delete process.env.CLAUDE_CONFIG_HOME

    expect(getDefaultPlansDirectory()).toBe(join('/tmp/free-code-config', 'plans'))
  })

  test('keeps legacy Claude config directory compatibility', () => {
    delete process.env.FREE_CODE_CONFIG_DIR
    delete process.env.FREE_CODE_CONFIG_HOME
    process.env.CLAUDE_CONFIG_DIR = '/tmp/claude-config'
    delete process.env.CLAUDE_CONFIG_HOME

    expect(getDefaultPlansDirectory()).toBe(join('/tmp/claude-config', 'plans'))
  })
})
