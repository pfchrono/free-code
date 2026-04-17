import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { parsePersistedSessionState } from '../../utils/persistedSessionState.js'
import { SessionContinuityManager } from './sessionContinuityManager.js'

describe('SessionContinuityManager', () => {
  let tempRoot: string
  let sessionDir: string
  let projectDir: string

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'session-continuity-'))
    sessionDir = join(tempRoot, 'sessions')
    projectDir = join(tempRoot, 'project')
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('uses provided real session id for canonical continuity persistence', async () => {
    const manager = new SessionContinuityManager({ sessionDir })
    await manager.initialize()

    const sessionId = 'session-real-123'
    await manager.startSession(projectDir, { sessionId })
    await manager.updateSession({
      conversationSummary: 'Canonical summary',
      keyInsights: ['Insight A'],
    })

    const persistedPath = join(projectDir, `${sessionId}.state.json`)
    const raw = await readFile(persistedPath, 'utf8')
    const parsed = parsePersistedSessionState(JSON.parse(raw))

    expect(parsed?.continuityMetadata?.sessionId).toBe(sessionId)
    expect(parsed?.continuityMetadata?.conversationSummary).toBe(
      'Canonical summary',
    )
    expect(parsed?.continuityMetadata?.keyInsights).toEqual(['Insight A'])
    expect(parsed?.memoryLineage?.authoritativeSource).toBe(
      'persisted_session_state',
    )
  })

  it('imports legacy session history into canonical continuity metadata', async () => {
    const now = Date.now()
    await rm(sessionDir, { recursive: true, force: true })
    await mkdir(sessionDir, { recursive: true })
    await Bun.write(
      join(sessionDir, 'history.json'),
      JSON.stringify({
        version: '1.0.0',
        currentSessionId: 'legacy-session',
        sessions: [
          {
            sessionId: 'legacy-session',
            projectPath: projectDir,
            startedAt: now - 1000,
            lastActivity: now,
            status: 'active',
            completedTasks: ['done'],
            remainingTasks: ['next'],
            workingFiles: ['a.ts'],
            keyInsights: ['Imported insight'],
            metadata: {},
          },
        ],
      }),
    )

    const manager = new SessionContinuityManager({ sessionDir })
    await manager.initialize()

    const current = manager.getCurrentSession()
    expect(current?.sessionId).toBe('legacy-session')

    const raw = await readFile(
      join(projectDir, 'legacy-session.state.json'),
      'utf8',
    )
    const parsed = parsePersistedSessionState(JSON.parse(raw))
    expect(parsed?.continuityMetadata?.sessionId).toBe('legacy-session')
    expect(parsed?.memoryLineage?.importedLegacySources).toEqual([
      'session-history',
    ])
  })
})
