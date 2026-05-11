import { afterEach, describe, expect, it } from 'bun:test'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { call } from './ratchet.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

const originalFreeCodeConfigDir = process.env.FREE_CODE_CONFIG_DIR

function resetConfigDirCache(): void {
  ;(getClaudeConfigHomeDir.cache as Map<unknown, unknown>).clear()
}

describe('/ratchet command', () => {
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

  it('records a failure as a durable harness entry', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-ratchet-'))
    resetConfigDirCache()

    const result = await call(
      'add handoff skipped after skill chain --impact "lost continuity" --desired "finalizer always runs" --evidence "src/commands.ts,bun test" --tags "skill,handoff"',
      {} as never,
    )

    expect(result.type).toBe('text')
    if (result.type !== 'text') return
    expect(result.value).toContain('Ratchet logged: r-')
    expect(result.value).toContain('finalizer always runs')

    const ledger = await readFile(
      join(process.env.FREE_CODE_CONFIG_DIR, 'harness', 'failures.jsonl'),
      'utf8',
    )
    expect(ledger).toContain('handoff skipped after skill chain')
    expect(ledger).toContain('lost continuity')
  })

  it('updates ratchet status', async () => {
    process.env.FREE_CODE_CONFIG_DIR = await mkdtemp(join(tmpdir(), 'free-code-ratchet-'))
    resetConfigDirCache()

    const added = await call('add goal stopped early', {} as never)
    expect(added.type).toBe('text')
    if (added.type !== 'text') return
    const id = added.value.match(/Ratchet logged: (r-[a-f0-9]+)/)?.[1]
    expect(id).toBeDefined()

    const updated = await call(`fixed ${id}`, {} as never)
    expect(updated.type).toBe('text')
    if (updated.type !== 'text') return
    expect(updated.value).toContain(`${id} fixed`)
  })
})
