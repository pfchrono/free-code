import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PersistentMemorySystem } from './persistentMemorySystem.js'

describe('PersistentMemorySystem', () => {
  let memoryDir: string

  beforeEach(async () => {
    memoryDir = await mkdtemp(join(tmpdir(), 'persistent-memory-'))
  })

  afterEach(async () => {
    await rm(memoryDir, { recursive: true, force: true })
  })

  it('preserves getEntries after flush and reload', async () => {
    const writer = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })

    await writer.initialize()
    await writer.addEntry({
      type: 'task',
      content: 'remember me',
      tags: ['keep'],
      importance: 0.8,
    })
    await writer.flush()

    const reader = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })
    await reader.initialize()

    await expect(reader.getEntries({ tags: ['keep'] })).resolves.toEqual([
      expect.objectContaining({
        content: 'remember me',
        type: 'task',
        tags: ['keep'],
      }),
    ])
  })
})
