import { describe, expect, it } from 'bun:test'
import { setCurrentResumeSource } from '../../bootstrap/state.js'
import type { LocalJSXCommandContext } from '../../types/command.js'
import {
  buildStatusSnapshot,
  renderStatusSnapshot,
} from './statusSnapshot.js'

function createContext(): LocalJSXCommandContext {
  const state = {
    mcp: {
      clients: [
        { type: 'connected', name: 'ok-server' },
        { type: 'failed', name: 'bad-server', error: 'offline' },
      ],
    },
    toolPermissionContext: {
      mode: 'default',
      additionalWorkingDirectories: new Set(),
      isBypassPermissionsModeAvailable: false,
    },
    fastMode: false,
    thinkingEnabled: true,
    agentDefinitions: {
      activeAgents: [],
      allAgents: [],
    },
    agent: undefined,
  }

  return {
    messages: [],
    getAppState: () => state,
    options: {
      mainLoopModel: 'sonnet',
      tools: [],
      agentDefinitions: state.agentDefinitions,
      customSystemPrompt: undefined,
      appendSystemPrompt: undefined,
    },
  } as LocalJSXCommandContext
}

describe('buildStatusSnapshot', () => {
  it('includes resume source, degraded MCP state, and compaction history', async () => {
    setCurrentResumeSource(
      'core_persisted_memory',
      'Recovered compacted core snapshot',
    )

    const snapshot = await buildStatusSnapshot(createContext(), {
      collectContextDataFn: async () =>
        ({
          totalTokens: 1000,
          rawMaxTokens: 10000,
          percentage: 10,
          isAutoCompactEnabled: true,
          autoCompactThreshold: 8000,
          autoCompactThresholdPercent: 80,
        }) as never,
      loadPersistedSessionStateFn: async () => ({
        version: 1,
        checkpointMetadata: {
          persistedAt: '2026-04-18T12:34:56.000Z',
          policy: 'checkpointed_state',
          policySource: 'persisted',
          transcriptPath: '/tmp/transcript.jsonl',
        },
        compactionHistory: [
          {
            trigger: 'auto',
            policy: 'checkpointed_state',
            occurredAt: '2026-04-16T00:00:00.000Z',
            beforeMessages: 40,
            afterMessages: 8,
            beforeTokens: 50000,
            afterTokens: 12000,
            retainedSummary: '7 messages kept after checkpointed state compaction',
            droppedSummary: '32 messages summarized',
          },
        ],
      }),
      isAutoCompactEnabledFn: () => true,
      getAutoCompactThresholdFn: () => 8000,
      shouldUseSessionMemoryCompactionFn: () => true,
      getProcessLifecycleSnapshotFn: () => ({
        ownedProcessCount: 1,
        activeProcessLabels: ['bridge-session:test'],
        cleanupHandlerCount: 2,
        recentDiagnostics: [
          {
            label: 'bridge-session:test',
            kind: 'process',
            phase: 'forced_termination',
            outcome: 'force_killed',
            durationMs: 10,
            occurredAt: '2026-04-16T00:00:01.000Z',
            pid: 1234,
          },
        ],
        lastShutdown: {
          at: '2026-04-16T00:00:01.000Z',
          forcedTerminationCount: 1,
          timeoutCount: 0,
          failureCount: 0,
        },
      }),
    })

    expect(snapshot.session.resumeSource.value).toBe('core_persisted_memory')
    expect(snapshot.mcp.health).toBe('warning')
    expect(snapshot.compaction.history).toHaveLength(1)
    expect(snapshot.cleanup.health).toBe('warning')

    const rendered = renderStatusSnapshot(snapshot)
    expect(rendered).toContain('### Compaction')
    expect(rendered).toContain('### Cleanup')
    expect(rendered).toContain('Owned processes: 1')
    expect(rendered).toContain('Active owners: bridge-session:test')
    expect(rendered).toContain('forced_termination/force_killed bridge-session:test pid=1234')
    expect(rendered).toContain('Threshold: 8,000 tok')
    expect(rendered).toContain('Enabled: yes')
    expect(rendered).toContain('Recent: 2026-04-16T00:00:00.000Z auto/checkpointed_state')
    expect(rendered).toContain('Retained: 7 messages kept after checkpointed state compaction')
    expect(rendered).toContain('Dropped: 32 messages summarized')
  })

  it('surfaces context collection failures as warnings', async () => {
    setCurrentResumeSource('fresh')

    const snapshot = await buildStatusSnapshot(createContext(), {
      collectContextDataFn: async () => {
        throw new Error('collector failed')
      },
      loadPersistedSessionStateFn: async () => null,
      isAutoCompactEnabledFn: () => false,
      getAutoCompactThresholdFn: () => 0.8,
      shouldUseSessionMemoryCompactionFn: () => false,
      getProcessLifecycleSnapshotFn: () => ({
        ownedProcessCount: 0,
        activeProcessLabels: [],
        cleanupHandlerCount: 0,
        recentDiagnostics: [],
        lastShutdown: {
          at: null,
          forcedTerminationCount: 0,
          timeoutCount: 0,
          failureCount: 0,
        },
      }),
    })

    expect(snapshot.context.health).toBe('warning')
    expect(snapshot.context.warnings[0]).toContain('collector failed')
    expect(snapshot.compaction.health).toBe('warning')
  })

  it('uses the shared live compaction policy when no persisted policy exists', async () => {
    setCurrentResumeSource('fresh')

    const snapshot = await buildStatusSnapshot(createContext(), {
      collectContextDataFn: async () =>
        ({
          totalTokens: 1000,
          rawMaxTokens: 10000,
          percentage: 10,
          isAutoCompactEnabled: false,
          autoCompactThreshold: 8000,
          autoCompactThresholdPercent: 80,
        }) as never,
      loadPersistedSessionStateFn: async () => ({
        version: 1,
        checkpointMetadata: {
          persistedAt: '2026-04-18T12:34:56.000Z',
          transcriptPath: '/tmp/transcript.jsonl',
        },
        compactionHistory: [],
      }),
      isAutoCompactEnabledFn: () => false,
      getAutoCompactThresholdFn: () => 0.8,
      shouldUseSessionMemoryCompactionFn: () => false,
      getProcessLifecycleSnapshotFn: () => ({
        ownedProcessCount: 0,
        activeProcessLabels: [],
        cleanupHandlerCount: 0,
        recentDiagnostics: [],
        lastShutdown: {
          at: null,
          forcedTerminationCount: 0,
          timeoutCount: 0,
          failureCount: 0,
        },
      }),
    })

    expect(snapshot.compaction.policy).toBe('rolling_summary')
    expect(snapshot.compaction.policySource).toBe('live_config')
  })

  it('uses persisted compaction policy from shared resolver when legacy fields are present', async () => {
    setCurrentResumeSource('fresh')

    const snapshot = await buildStatusSnapshot(createContext(), {
      collectContextDataFn: async () =>
        ({
          totalTokens: 1000,
          rawMaxTokens: 10000,
          percentage: 10,
          isAutoCompactEnabled: false,
          autoCompactThreshold: 8000,
          autoCompactThresholdPercent: 80,
        }) as never,
      loadPersistedSessionStateFn: async () => ({
        version: 1,
        checkpointMetadata: {
          persistedAt: '2026-04-18T12:34:56.000Z',
          strategy: 'checkpointed_state',
          strategySource: 'persisted',
          transcriptPath: '/tmp/transcript.jsonl',
        },
        compactionHistory: [],
      }),
      isAutoCompactEnabledFn: () => false,
      getAutoCompactThresholdFn: () => 0.8,
      shouldUseSessionMemoryCompactionFn: () => false,
      getProcessLifecycleSnapshotFn: () => ({
        ownedProcessCount: 0,
        activeProcessLabels: [],
        cleanupHandlerCount: 0,
        recentDiagnostics: [],
        lastShutdown: {
          at: null,
          forcedTerminationCount: 0,
          timeoutCount: 0,
          failureCount: 0,
        },
      }),
    })

    expect(snapshot.compaction.policy).toBe('checkpointed_state')
    expect(snapshot.compaction.policySource).toBe('persisted')
  })
})
