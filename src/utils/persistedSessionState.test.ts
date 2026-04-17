import { describe, expect, it } from 'bun:test'
import { getClaudeConfigHomeDir } from './envUtils.js'
import {
  getPersistedSessionStatePath,
  parsePersistedSessionState,
} from './persistedSessionState.js'
import { resolveResumeMessages } from './conversationRecovery.js'

describe('getPersistedSessionStatePath', () => {
  it('stores explicit project paths under config/projects using a sanitized directory name', () => {
    expect(
      getPersistedSessionStatePath('session-1', {
        projectDir: 'F:\\code\\free-code',
      }),
    ).toBe(
      `${getClaudeConfigHomeDir()}/projects/F--code-free-code/session-1.state.json`,
    )
  })
})

describe('parsePersistedSessionState', () => {
  it('drops invalid core messages but keeps valid visible history and bounded compaction history', () => {
    const parsed = parsePersistedSessionState({
      version: 1,
      visibleMessages: [{ type: 'user', uuid: 'u1', message: { content: 'hi' } }],
      coreMessages: 'broken',
      continuityMetadata: {
        sessionId: 'session-1',
        projectPath: '/tmp/project',
        startedAt: 1,
        lastActivity: 2,
        status: 'active',
        completedTasks: ['done'],
        remainingTasks: ['todo'],
        workingFiles: ['a.ts'],
        keyInsights: ['keep this'],
        metadata: { imported: true },
        persistedAt: '2026-04-16T00:00:00.000Z',
      },
      memoryLineage: {
        authoritativeSource: 'persisted_session_state',
        importedLegacySources: ['session-history'],
        legacySidecarDetected: true,
        persistedAt: '2026-04-16T00:00:00.000Z',
      },
      compactionHistory: [
        {
          trigger: 'manual',
          strategy: 'summary',
          occurredAt: '1',
        },
        {
          trigger: 'auto',
          strategy: 'session_memory',
          occurredAt: '2',
        },
      ],
    })

    expect(parsed?.visibleMessages).toHaveLength(1)
    expect(parsed?.coreMessages).toBeUndefined()
    expect(parsed?.continuityMetadata?.sessionId).toBe('session-1')
    expect(parsed?.memoryLineage?.importedLegacySources).toEqual([
      'session-history',
    ])
    expect(parsed?.compactionHistory).toHaveLength(2)
  })
})

describe('resolveResumeMessages', () => {
  it('falls back to visible history when persisted core memory is missing', () => {
    const transcriptMessages = [
      { type: 'user', uuid: 'u1', message: { content: 'hello' } },
    ] as never

    const resolved = resolveResumeMessages(transcriptMessages, {
      version: 1,
      visibleMessages: [],
    })

    expect(resolved?.resumeSource).toBe('visible_history')
    expect(resolved?.resumeDetail).toContain('Loaded visible transcript history')
    expect(resolved?.messages).toEqual(transcriptMessages)
  })

  it('uses checkpoint metadata when no replayable messages remain', () => {
    const resolved = resolveResumeMessages(null, {
      version: 1,
      checkpointMetadata: {
        persistedAt: '2026-04-16T00:00:00.000Z',
        strategy: 'summary',
      },
    })

    expect(resolved?.resumeSource).toBe('checkpointed_state')
    expect(resolved?.messages).toEqual([])
  })
})
