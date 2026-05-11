import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
import { asSessionId } from '../../types/ids.js'
import { goalCheckpointPath } from './goalCheckpoint.js'

const originalFreeCodeConfigDir = process.env.FREE_CODE_CONFIG_DIR
const sessionA = asSessionId('session-a')
const sessionB = asSessionId('session-b')
const sessionC = asSessionId('session-c')
const sessionD = asSessionId('session-d')
const sessionE = asSessionId('session-e')

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

    const created = await createGoal('ship goal loop', 100, sessionA)
    const loaded = await getGoal(sessionA)

    expect(created.objective).toBe('ship goal loop')
    expect(loaded?.status).toBe('active')
    expect(loaded?.remainingTokens).toBe(100)
  })

  it('marks goal budget_limited when usage reaches budget', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-goal-'))
    resetConfigDirCache()

    await createGoal('bounded work', 10, sessionB)
    const updated = await addGoalUsage(11, 3, sessionB)

    expect(updated?.status).toBe('budget_limited')
    expect(updated?.remainingTokens).toBe(0)
  })

  it('allows model completion status update', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-goal-'))
    resetConfigDirCache()

    await createGoal('finish work', undefined, sessionC)
    const updated = await updateGoalStatus('complete', sessionC)

    expect(updated.status).toBe('complete')
  })

  it('records compact goal context state and recent progress notes', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-goal-'))
    resetConfigDirCache()

    await createGoal('keep track', undefined, sessionD)
    await recordGoalProgress('First checkpoint with useful state', sessionD)
    const updated = await recordGoalProgress('Second checkpoint', sessionD)

    expect(updated?.contextState?.summary).toBe('Second checkpoint')
    expect(updated?.progressNotes?.map(note => note.text)).toEqual([
      'First checkpoint with useful state',
      'Second checkpoint',
    ])
  })

  it('writes durable checkpoint markdown as goal state changes', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-goal-'))
    resetConfigDirCache()

    await createGoal('persist checkpoint', undefined, sessionE)
    await recordGoalProgress('Implementation started', sessionE)

    const checkpoint = await readFile(goalCheckpointPath(sessionE), 'utf8')

    expect(checkpoint).toContain('# Free-Code Goal Checkpoint')
    expect(checkpoint).toContain('persist checkpoint')
    expect(checkpoint).toContain('Implementation started')
    expect(checkpoint).toContain('Continue from this checkpoint')
  })
})
