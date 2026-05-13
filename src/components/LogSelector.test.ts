import { describe, expect, it } from 'bun:test'

import type { LogOption } from '../types/logs.js'
import { getLogSummaryPreview, getSessionIdSearchLabel, matchesLogSearchQuery } from './LogSelector.js'

function buildLog(options?: { sessionId?: string; useLiteLog?: boolean; summary?: string }): LogOption {
  const sessionId = options?.sessionId ?? '12345678-90ab-cdef-1234-567890abcdef'
  const modifiedAt = '2026-04-21T00:00:00.000Z'

  return {
    date: modifiedAt,
    messages: options?.useLiteLog
      ? []
      : [
          {
            cwd: '/tmp/project',
            userType: 'external',
            sessionId,
            timestamp: modifiedAt,
            version: 'test',
          } as LogOption['messages'][number],
        ],
    sessionId: options?.useLiteLog ? sessionId : undefined,
    value: 0,
    created: new Date(modifiedAt),
    modified: new Date(modifiedAt),
    firstPrompt: 'Fix resume picker',
    summary: options?.summary,
    messageCount: options?.useLiteLog ? 0 : 1,
    isSidechain: false,
  }
}

describe('getLogSummaryPreview', () => {
  it('normalizes whitespace in session summaries', () => {
    expect(getLogSummaryPreview(buildLog({ summary: '  task\n\nnext step  ' }), 40)).toBe(
      'task next step',
    )
  })

  it('truncates long session summaries to fit width', () => {
    expect(getLogSummaryPreview(buildLog({ summary: 'resume picker now shows retained continuity context' }), 24)).toBe(
      'resume picker now shows…',
    )
  })

  it('returns undefined when summary is missing', () => {
    expect(getLogSummaryPreview(buildLog(), 40)).toBeUndefined()
  })
})

describe('getSessionIdSearchLabel', () => {
  it('formats session prefix label from full logs', () => {
    expect(getSessionIdSearchLabel(buildLog())).toBe('session 12345678')
  })

  it('formats session prefix label from lite logs', () => {
    expect(getSessionIdSearchLabel(buildLog({ useLiteLog: true }))).toBe('session 12345678')
  })
})

describe('matchesLogSearchQuery', () => {
  it('matches session ID prefixes for full logs', () => {
    expect(matchesLogSearchQuery(buildLog(), '12345678')).toBe(true)
  })

  it('matches session ID prefixes for lite logs', () => {
    expect(matchesLogSearchQuery(buildLog({ useLiteLog: true }), '12345678')).toBe(true)
  })

  it('matches normalized summary text', () => {
    expect(matchesLogSearchQuery(buildLog({ summary: '  task\n\nnext step  ' }), 'task next')).toBe(true)
  })

  it('does not match non-prefix session fragments', () => {
    expect(matchesLogSearchQuery(buildLog(), '90ab')).toBe(false)
  })
})
