import { mkdtemp, rm, writeFile } from 'fs/promises'
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

  it('persists updated entries after flush and reload', async () => {
    const writer = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })

    await writer.initialize()
    const id = await writer.addEntry({
      type: 'task',
      content: 'old content',
      tags: ['before'],
      importance: 0.4,
    })

    await expect(writer.updateEntry(id, {
      content: 'new content',
      tags: ['after'],
      importance: 0.9,
    })).resolves.toBe(true)
    await writer.flush()

    const reader = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })
    await reader.initialize()

    await expect(reader.getEntries({ tags: ['after'] })).resolves.toEqual([
      expect.objectContaining({
        id,
        content: 'new content',
        tags: ['after'],
        importance: 0.9,
      }),
    ])
  })

  it('persists deletions after flush and reload', async () => {
    const writer = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })

    await writer.initialize()
    const id = await writer.addEntry({
      type: 'task',
      content: 'delete me',
      tags: ['gone'],
      importance: 0.5,
    })

    await expect(writer.deleteEntry(id)).resolves.toBe(true)
    await writer.flush()

    const reader = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })
    await reader.initialize()

    await expect(reader.getEntries({ tags: ['gone'] })).resolves.toEqual([])
  })

  it('compacts expired entries before flush and reload', async () => {
    const writer = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })

    await writer.initialize()
    await writer.addEntry({
      type: 'task',
      content: 'expired',
      tags: ['expire'],
      importance: 0.1,
      ttl: -1,
    })
    await writer.addEntry({
      type: 'task',
      content: 'kept',
      tags: ['keep'],
      importance: 0.9,
    })

    await writer.compact()
    await writer.flush()

    const reader = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })
    await reader.initialize()

    await expect(reader.getEntries()).resolves.toEqual([
      expect.objectContaining({
        content: 'kept',
        tags: ['keep'],
      }),
    ])
  })

  it('saves project memory and returns recent relevant project entries', async () => {
    const memorySystem = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })

    await memorySystem.initialize()
    await memorySystem.saveProjectMemory({
      projectPath: '/repo-a',
      content: 'Implemented resume output rendering',
      summary: 'resume output',
      tags: ['resume'],
      importance: 0.9,
    })
    await memorySystem.saveProjectMemory({
      projectPath: '/repo-a',
      content: 'Added memory augmentation hooks',
      tags: ['memory'],
      importance: 0.4,
    })
    await memorySystem.saveProjectMemory({
      projectPath: '/repo-b',
      content: 'Different project entry',
      tags: ['resume'],
      importance: 1,
    })

    await expect(
      memorySystem.getRecentRelevantMemory({
        projectPath: '/repo-a',
        query: 'resume',
        limit: 2,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        projectPath: '/repo-a',
        content: 'Implemented resume output rendering',
      }),
      expect.objectContaining({
        projectPath: '/repo-a',
        content: 'Added memory augmentation hooks',
      }),
    ])
  })

  it('explains why project memory was recalled', async () => {
    const memorySystem = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })

    await memorySystem.initialize()
    await memorySystem.saveProjectMemory({
      projectPath: '/repo-a',
      sessionId: 'session-123',
      content: 'Resume command now shows richer output',
      summary: 'resume output details',
      tags: ['resume'],
      metadata: { feature: 'resume' },
      importance: 0.95,
    })

    await expect(
      memorySystem.explainRecall({
        projectPath: '/repo-a',
        sessionId: 'session-123',
        query: 'resume',
        limit: 1,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        score: expect.any(Number),
        reasons: expect.arrayContaining([
          'project path matched',
          'session matched',
          'content matched query',
          'summary matched query',
          'tag matched query',
          'metadata matched query',
          'high importance',
        ]),
        entry: expect.objectContaining({
          projectPath: '/repo-a',
          sessionId: 'session-123',
        }),
      }),
    ])
  })

  it('recovers legacy entries from entries.json when store.json is missing', async () => {
    await writeFile(
      join(memoryDir, 'entries.json'),
      JSON.stringify([
        {
          content: 'Recovered insight',
          type: 'insight',
          tags: ['legacy'],
          projectPath: '/repo-a',
          sessionId: 'legacy-session',
          importance: 0.7,
        },
        {
          nope: true,
        },
      ]),
      'utf8',
    )

    const memorySystem = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })

    await memorySystem.initialize()

    await expect(memorySystem.getEntries({ tags: ['legacy'] })).resolves.toEqual([
      expect.objectContaining({
        content: 'Recovered insight',
        type: 'insight',
        projectPath: '/repo-a',
        sessionId: 'legacy-session',
        provider: 'native',
        source: 'system',
      }),
    ])
  })

  it('recovers legacy session history into structured memory entries', async () => {
    await writeFile(
      join(memoryDir, 'history.json'),
      JSON.stringify({
        sessions: [
          {
            sessionId: 'legacy-session',
            projectPath: '/repo-a',
            conversationSummary: 'Implemented resume persistence',
            keyInsights: ['Need canonical state'],
            completedTasks: ['Wired importer'],
            remainingTasks: ['Add regression tests'],
            workingFiles: ['src/query.ts'],
            status: 'active',
          },
        ],
      }),
      'utf8',
    )

    const memorySystem = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
    })

    await memorySystem.initialize()

    await expect(
      memorySystem.getEntries({ projectPath: '/repo-a', sessionId: 'legacy-session' })
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'session',
          content: 'Implemented resume persistence',
          tags: ['legacy', 'session-summary'],
        }),
        expect.objectContaining({
          type: 'insight',
          content: 'Need canonical state',
          tags: ['legacy', 'session-insight'],
        }),
        expect.objectContaining({
          type: 'task',
          content: 'Wired importer',
          tags: ['legacy', 'completed-task'],
          metadata: expect.objectContaining({ taskStatus: 'completed' }),
        }),
        expect.objectContaining({
          type: 'task',
          content: 'Add regression tests',
          tags: ['legacy', 'remaining-task'],
          metadata: expect.objectContaining({ taskStatus: 'remaining' }),
        }),
      ])
    )
  })

  it('falls back to native storage when Archivist provider is configured', async () => {
    const memorySystem = new PersistentMemorySystem({
      memoryDir,
      defaultTTL: 60_000,
      provider: 'archivist',
    })

    await memorySystem.initialize()
    await memorySystem.addEntry({
      type: 'context',
      content: 'fallback provider still stores memory',
      tags: ['archivist'],
    })

    await expect(memorySystem.searchEntries('fallback provider')).resolves.toEqual([
      expect.objectContaining({
        provider: 'native',
        content: 'fallback provider still stores memory',
      }),
    ])
  })
})
