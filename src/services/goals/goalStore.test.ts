import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  addGoalUsage,
  createGoal,
  getGoal,
  recordGoalProgress,
  updateGoalStatus,
} from './goalStore.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

const originalFreeCodeConfigDir = process.env.FREE_CODE_CONFIG_DIR

function resetConfigDirCache(): void {
  ;(getClaudeConfigHomeDir.cache as Map<unknown, unknown>).clear()
}

describe('goalStore', () => {
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

  it('creates and retrieves a session goal from free-code config storage', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-goal-'))
    resetConfigDirCache()

    const created = await createGoal('ship goal loop', 100, 'session-a')
    const loaded = await getGoal('session-a')

    expect(created.objective).toBe('ship goal loop')
    expect(loaded?.status).toBe('active')
    expect(loaded?.remainingTokens).toBe(100)
  })

  it('marks goal budget_limited when usage reaches budget', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-goal-'))
    resetConfigDirCache()

    await createGoal('bounded work', 10, 'session-b')
    const updated = await addGoalUsage(11, 3, 'session-b')

    expect(updated?.status).toBe('budget_limited')
    expect(updated?.remainingTokens).toBe(0)
  })

  it('allows model completion status update', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-goal-'))
    resetConfigDirCache()

    await createGoal('finish work', undefined, 'session-c')
    const updated = await updateGoalStatus('complete', 'session-c')

    expect(updated.status).toBe('complete')
  })

  it('records compact goal context state and recent progress notes', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-goal-'))
    resetConfigDirCache()

    await createGoal('keep track', undefined, 'session-d')
    await recordGoalProgress('First checkpoint with useful state', 'session-d')
    const updated = await recordGoalProgress('Second checkpoint', 'session-d')

    expect(updated?.contextState?.summary).toBe('Second checkpoint')
    expect(updated?.progressNotes?.map(note => note.text)).toEqual([
      'First checkpoint with useful state',
      'Second checkpoint',
    ])
  })
})
