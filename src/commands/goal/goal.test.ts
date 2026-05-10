import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { call } from './goal.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

const originalFreeCodeConfigDir = process.env.FREE_CODE_CONFIG_DIR

function resetConfigDirCache(): void {
  ;(getClaudeConfigHomeDir.cache as Map<unknown, unknown>).clear()
}

describe('/goal command', () => {
  afterEach(async () => {
    if (process.env.FREE_CODE_CONFIG_DIR) {
      await rm(process.env.FREE_CODE_CONFIG_DIR, { recursive: true, force: true })
    }
    if (originalFreeCodeConfigDir === undefined) {
      delete process.env.FREE_CODE_CONFIG_DIR
    } else {
      process.env.FREE_CODE_CONFIG_DIR = originalFreeCodeConfigDir
    }
    resetConfigDirCache()
  })

  it('starts working immediately after setting a new goal', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-goal-command-'))
    resetConfigDirCache()

    const result = await call('ship the thing', {} as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return
    expect(result.shouldQuery).toBe(true)
    expect(result.metaMessages?.[0]).toContain('Continue working toward the active Free-Code session goal.')
    expect(result.value).toContain('Starting now.')
  })

  it('does not replace an active goal without explicit replace', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-goal-command-'))
    resetConfigDirCache()

    await call('first goal', {} as never)
    const result = await call('second goal', {} as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return
    expect(result.shouldQuery).toBeUndefined()
    expect(result.value).toContain('A goal is already active: first goal')
    expect(result.value).toContain('/goal replace second goal')
  })
})
