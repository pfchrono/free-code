import { describe, expect, it } from 'bun:test'

import {
  findTimelineMatches,
  formatTimelineEntry,
  type SessionTimelineEntry,
} from './sessionTimeline.js'

function buildEntry(overrides: Partial<SessionTimelineEntry>): SessionTimelineEntry {
  return {
    id: 'e1',
    at: '2026-04-20T00:00:00.000Z',
    sessionId: '12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    projectPath: '/tmp/project',
    kind: 'goal',
    status: 'open',
    summary: 'Investigate issue #42 and wire search UX',
    refs: ['#42'],
    ...overrides,
  }
}

describe('findTimelineMatches', () => {
  const older = buildEntry({
    id: 'e1',
    at: '2026-04-20T00:00:00.000Z',
    sessionId: '12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    summary: 'Investigate issue #42 and wire search UX',
    refs: ['#42'],
  })
  const newer = buildEntry({
    id: 'e2',
    at: '2026-04-22T00:00:00.000Z',
    sessionId: '12345678-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    summary: 'Fix flaky search UX for retry flow',
    refs: ['BUG-9'],
  })
  const other = buildEntry({
    id: 'e3',
    at: '2026-04-21T00:00:00.000Z',
    sessionId: '87654321-cccc-4ccc-8ccc-cccccccccccc',
    summary: 'Ship export polish',
    refs: ['#77'],
  })

  it('prefers exact entry id matches', () => {
    expect(findTimelineMatches([older, newer, other], 'e1')).toEqual([older])
  })

  it('matches session id prefixes and sorts newest first', () => {
    expect(findTimelineMatches([older, newer, other], '12345678').map(entry => entry.id)).toEqual([
      'e2',
      'e1',
    ])
  })

  it('matches refs exactly ignoring case', () => {
    expect(findTimelineMatches([older, newer, other], 'bug-9')).toEqual([newer])
  })

  it('matches summary text when ids and refs do not match', () => {
    expect(findTimelineMatches([older, newer, other], 'search ux').map(entry => entry.id)).toEqual([
      'e2',
      'e1',
    ])
  })
})

describe('formatTimelineEntry', () => {
  it('includes session id in detailed output', () => {
    expect(
      formatTimelineEntry(
        buildEntry({
          continuity: 'resume',
        }),
      ),
    ).toContain('session: 12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })
})
