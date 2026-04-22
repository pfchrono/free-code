import { describe, expect, it } from 'bun:test'

import { buildPersistedResumeSnapshot } from './sessionRestore.js'

describe('buildPersistedResumeSnapshot', () => {
  it('returns null when no continuity or compaction data exists', () => {
    expect(buildPersistedResumeSnapshot()).toBeNull()
  })

  it('includes current task, files, insights, and compaction summary', () => {
    const summary = buildPersistedResumeSnapshot(
      {
        sessionId: 'session-1',
        projectPath: '/tmp/project',
        startedAt: 1,
        lastActivity: 2,
        status: 'active',
        completedTasks: ['done'],
        remainingTasks: ['finish resume UX', 'capture fixtures'],
        currentTask: 'finish resume UX',
        workingFiles: ['src/utils/sessionRestore.ts', 'src/utils/messagePruning.ts'],
        conversationSummary: 'Working on compaction recovery.',
        keyInsights: ['persist continuity snapshot', 'carry working files'],
        recentFiles: ['src/utils/sessionRestore.ts'],
        recentSymbols: ['processResumedConversation'],
        recentTasks: ['tighten resume snapshot'],
        recentDecisions: ['prefer persisted state over transcript scan'],
        metadata: {},
        persistedAt: '2026-04-21T00:00:00.000Z',
      },
      {
        trigger: 'auto',
        policy: 'microcompact',
        occurredAt: '2026-04-21T00:00:00.000Z',
        beforeTokens: 12000,
        afterTokens: 3500,
        beforeMessages: 90,
        afterMessages: 24,
        retainedSummary: 'Keep current task and working files visible.',
      },
    )

    expect(summary).toContain('## Resume Snapshot')
    expect(summary).toContain('- Current task: finish resume UX')
    expect(summary).toContain('- Working files: src/utils/sessionRestore.ts, src/utils/messagePruning.ts')
    expect(summary).toContain('- Key insights: persist continuity snapshot | carry working files')
    expect(summary).toContain('- Session summary: Working on compaction recovery.')
    expect(summary).toContain('- Last compaction: auto 90→24 messages, 12000→3500 tokens')
    expect(summary).toContain('- Retained summary: Keep current task and working files visible.')
  })

  it('builds a snapshot from compaction history only', () => {
    const summary = buildPersistedResumeSnapshot(undefined, {
      trigger: 'manual',
      policy: 'microcompact',
      occurredAt: '2026-04-21T00:00:00.000Z',
      beforeMessages: 40,
      afterMessages: 12,
      beforeTokens: 8000,
      afterTokens: 2400,
    })

    expect(summary).toBe(
      '## Resume Snapshot\n- Last compaction: manual 40→12 messages, 8000→2400 tokens',
    )
  })
})
