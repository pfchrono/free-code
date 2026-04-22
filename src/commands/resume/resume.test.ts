import { describe, expect, it } from 'bun:test'

import { buildResumePickerSummary } from './resume.js'

describe('buildResumePickerSummary', () => {
  it('returns undefined when no persisted hints exist', () => {
    expect(buildResumePickerSummary(null)).toBeUndefined()
  })

  it('summarizes current task, files, decisions, and compaction hints', () => {
    const summary = buildResumePickerSummary({
      version: 1,
      continuityMetadata: {
        sessionId: 'session-1',
        projectPath: '/tmp/project',
        startedAt: 1,
        lastActivity: 2,
        status: 'active',
        completedTasks: [],
        remainingTasks: ['wire /resume picker'],
        currentTask: 'wire /resume picker',
        workingFiles: ['src/commands/resume/resume.tsx', 'src/utils/sessionRestore.ts'],
        keyInsights: ['persist better resume hints'],
        recentDecisions: ['show continuity in picker'],
        metadata: {},
        persistedAt: '2026-04-21T00:00:00.000Z',
      },
      compactionHistory: [{
        trigger: 'auto',
        policy: 'microcompact',
        occurredAt: '2026-04-21T00:00:00.000Z',
        retainedSummary: 'Keep current task visible.',
      }],
    })

    expect(summary).toBe(
      'Task: wire /resume picker • Files: src/commands/resume/resume.tsx, src/utils/sessionRestore.ts • Decision: show continuity in picker • Compact: Keep current task visible.',
    )
  })
})
