import { describe, expect, it } from 'bun:test'

import type { LogOption } from '../../types/logs.js'
import { buildResumePickerSummary, findCustomTitleResumeMatches, findSessionIdPrefixMatches, resumeHelpMessage } from './resume.js'

function buildLog(sessionId: string, modifiedAt: string, customTitle?: string): LogOption {
  return {
    date: modifiedAt,
    messages: [
      {
        cwd: '/tmp/project',
        userType: 'external',
        sessionId,
        timestamp: modifiedAt,
        version: 'test',
      } as LogOption['messages'][number],
    ],
    value: 0,
    created: new Date(modifiedAt),
    modified: new Date(modifiedAt),
    firstPrompt: 'test',
    messageCount: 1,
    isSidechain: false,
    customTitle,
  }
}

describe('resumeHelpMessage', () => {
  it('mentions prefix refinement when a session is not found', () => {
    expect(resumeHelpMessage({ resultType: 'sessionNotFound', arg: '12345678' })).toBe(
      'Session 12345678 was not found. Try a longer session ID prefix or use /resume to search.',
    )
  })

  it('mentions longer prefixes when matches are ambiguous', () => {
    expect(resumeHelpMessage({ resultType: 'multipleMatches', arg: '12345678', count: 2 })).toBe(
      'Found 2 sessions matching 12345678. Use a longer session ID prefix or run /resume to pick a specific session.',
    )
  })

  it('shows top matches when ambiguous session IDs have candidate sessions', () => {
    expect(
      resumeHelpMessage({
        resultType: 'multipleMatches',
        arg: '12345678',
        count: 2,
        matches: [
          buildLog('12345678-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-04-22T00:00:00.000Z'),
          buildLog('12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-04-20T00:00:00.000Z'),
        ],
      }),
    ).toBe(
      'Found 2 sessions matching 12345678. Use a longer session ID prefix or run /resume to pick a specific session.\n\nTop matches:\n  12345678  test  2026-04-22\n  12345678  test  2026-04-20',
    )
  })
})

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

describe('findCustomTitleResumeMatches', () => {
  it('returns exact matches without falling back to partial search', async () => {
    const search = async (query: string, options: { exact: boolean }) => {
      if (options.exact) {
        return [buildLog('12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-04-20T00:00:00.000Z', query)]
      }
      throw new Error('partial search should not run when exact matches exist')
    }

    const matches = await findCustomTitleResumeMatches('Fix parser', search)

    expect(matches.map(log => log.customTitle)).toEqual(['Fix parser'])
  })

  it('falls back to partial matches when exact search is empty', async () => {
    const search = async (query: string, options: { exact: boolean }) => options.exact
      ? []
      : [
          buildLog('12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-04-20T00:00:00.000Z', `Investigate ${query}`),
          buildLog('12345678-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-04-22T00:00:00.000Z', `${query} follow-up`),
        ]

    const matches = await findCustomTitleResumeMatches('parser', search)

    expect(matches.map(log => log.customTitle)).toEqual(['Investigate parser', 'parser follow-up'])
  })
})

describe('findSessionIdPrefixMatches', () => {
  it('returns unique prefix matches sorted by most recent first', () => {
    const matches = findSessionIdPrefixMatches(
      [
        buildLog('12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-04-20T00:00:00.000Z'),
        buildLog('12345678-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-04-22T00:00:00.000Z'),
        buildLog('87654321-cccc-4ccc-8ccc-cccccccccccc', '2026-04-21T00:00:00.000Z'),
      ],
      '12345678-b',
    )

    expect(matches.map(log => log.messages[0]?.sessionId)).toEqual([
      '12345678-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ])
  })

  it('ignores short or non-uuid-like prefixes', () => {
    expect(findSessionIdPrefixMatches([buildLog('12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-04-20T00:00:00.000Z')], '1234567')).toEqual([])
    expect(findSessionIdPrefixMatches([buildLog('12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-04-20T00:00:00.000Z')], 'resume bug')).toEqual([])
  })

  it('returns all matching logs when prefix is ambiguous', () => {
    const matches = findSessionIdPrefixMatches(
      [
        buildLog('12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-04-20T00:00:00.000Z'),
        buildLog('12345678-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-04-22T00:00:00.000Z'),
      ],
      '12345678',
    )

    expect(matches.map(log => log.messages[0]?.sessionId)).toEqual([
      '12345678-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ])
  })
})
