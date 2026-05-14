import { describe, expect, it } from 'bun:test'
import { getClaudeConfigHomeDir } from './envUtils.js'
import {
  getPersistedSessionStatePath,
  mergeVisiblePersistedSessionState,
  parsePersistedSessionState,
} from './persistedSessionState.js'
import { resolveResumeMessages } from './conversationRecovery.js'

describe('getPersistedSessionStatePath', () => {
  it('stores explicit Windows project paths under config/projects using a sanitized directory name', () => {
    expect(
      getPersistedSessionStatePath('session-1', {
        projectDir: 'F:\\code\\free-code',
      }),
    ).toBe(
      `${getClaudeConfigHomeDir()}/projects/F--code-free-code/session-1.state.json`,
    )
  })

  it('stores explicit POSIX project paths under config/projects using a sanitized directory name', () => {
    expect(
      getPersistedSessionStatePath('session-1', {
        projectDir: '/home/pfchrono/code/free-code',
      }),
    ).toBe(
      `${getClaudeConfigHomeDir()}/projects/-home-pfchrono-code-free-code/session-1.state.json`,
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
        recentFiles: ['src/query.ts'],
        recentSymbols: ['appendSystemPrompt'],
        recentTasks: ['finish resume'],
        recentDecisions: ['keep payload compact'],
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
          policy: 'rolling_summary',
          occurredAt: '1',
        },
        {
          trigger: 'auto',
          strategy: 'checkpointed_state',
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

describe('mergeVisiblePersistedSessionState', () => {
  it('preserves compacted core messages when visible history is refreshed', () => {
    const coreMessages = [
      { type: 'system', uuid: 'core-1', message: { content: 'compact summary' } },
    ] as never
    const visibleMessages = [
      { type: 'user', uuid: 'visible-1', message: { content: 'keep scrolling' } },
    ] as never

    const merged = mergeVisiblePersistedSessionState(
      {
        version: 1,
        coreMessages,
        checkpointMetadata: {
          persistedAt: '2026-05-14T00:00:00.000Z',
          policy: 'rolling_summary',
        },
        resumeMetadata: {
          source: 'core_persisted_memory',
          persistedAt: '2026-05-14T00:00:00.000Z',
          detail: 'Loaded compacted core memory',
        },
        compactionHistory: [
          {
            trigger: 'manual',
            policy: 'rolling_summary',
            occurredAt: '2026-05-14T00:00:00.000Z',
          },
        ],
      },
      visibleMessages,
    )

    expect(merged.visibleMessages).toEqual(visibleMessages)
    expect(merged.coreMessages).toEqual(coreMessages)
    expect(merged.checkpointMetadata?.policy).toBe('rolling_summary')
    expect(merged.resumeMetadata?.source).toBe('core_persisted_memory')
    expect(merged.compactionHistory).toHaveLength(1)
  })
})

describe('resolveResumeMessages', () => {
  it('uses persisted core memory before newer visible transcript history', () => {
    const transcriptMessages = [
      { type: 'user', uuid: 'transcript-1', message: { content: 'new visible tail' } },
    ] as never
    const coreMessages = [
      { type: 'system', uuid: 'core-1', message: { content: 'compacted task summary' } },
    ] as never

    const resolved = resolveResumeMessages(transcriptMessages, {
      version: 1,
      coreMessages,
      visibleMessages: transcriptMessages,
    })

    expect(resolved?.resumeSource).toBe('core_persisted_memory')
    expect(resolved?.messages).toEqual(coreMessages)
  })

  it('does not resurrect pre-compact transcript history when core memory exists', () => {
    const preCompactTranscript = [
      { type: 'user', uuid: 'old-1', message: { content: 'obsolete pre-compact context' } },
      { type: 'assistant', uuid: 'old-2', message: { content: 'obsolete answer' } },
    ] as never
    const compactedCore = [
      { type: 'system', uuid: 'compact-1', message: { content: 'retained compact summary' } },
    ] as never

    const resolved = resolveResumeMessages(preCompactTranscript, {
      version: 1,
      coreMessages: compactedCore,
      visibleMessages: preCompactTranscript,
      compactionHistory: [
        {
          trigger: 'auto',
          policy: 'rolling_summary',
          occurredAt: '2026-05-14T00:00:00.000Z',
          retainedSummary: 'retained compact summary',
        },
      ],
    })

    expect(resolved?.resumeSource).toBe('core_persisted_memory')
    expect(resolved?.messages).toEqual(compactedCore)
  })

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
        policy: 'rolling_summary',
      },
    })

    expect(resolved?.resumeSource).toBe('checkpointed_state')
    expect(resolved?.messages).toEqual([])
  })
})
