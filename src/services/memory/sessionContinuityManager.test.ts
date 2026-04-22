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
    await manager.recordActivity({
      files: ['src/query.ts'],
      symbols: ['appendSystemPrompt'],
      task: 'Finish resume output',
      decision: 'Keep payload compact',
    })

    const persistedPath = join(projectDir, `${sessionId}.state.json`)
    const raw = await readFile(persistedPath, 'utf8')
    const parsed = parsePersistedSessionState(JSON.parse(raw))

    expect(parsed?.continuityMetadata?.sessionId).toBe(sessionId)
    expect(parsed?.continuityMetadata?.conversationSummary).toBe(
      'Canonical summary',
    )
    expect(parsed?.continuityMetadata?.keyInsights).toEqual(['Insight A'])
    expect(parsed?.continuityMetadata?.recentFiles).toEqual(['src/query.ts'])
    expect(parsed?.continuityMetadata?.recentSymbols).toEqual([
      'appendSystemPrompt',
    ])
    expect(parsed?.continuityMetadata?.recentTasks).toEqual([
      'Finish resume output',
    ])
    expect(parsed?.continuityMetadata?.recentDecisions).toEqual([
      'Keep payload compact',
    ])
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
    await manager.updateSession({ conversationSummary: 'Imported legacy session' })

    const current = manager.getCurrentSession()
    expect(current?.sessionId).toBe('legacy-session')

    const raw = await readFile(
      join(projectDir, 'legacy-session.state.json'),
      'utf8',
    )
    const parsed = parsePersistedSessionState(JSON.parse(raw))
    expect(parsed?.continuityMetadata?.sessionId).toBe('legacy-session')
    expect(parsed?.continuityMetadata?.workingFiles).toEqual(['a.ts'])
  })

  it('builds resume snapshot and context from recorded activity', async () => {
    const manager = new SessionContinuityManager({ sessionDir })
    await manager.initialize()
    await manager.startSession(projectDir, { sessionId: 'session-resume-123' })
    await manager.recordActivity({
      files: ['src/services/memory/sessionContinuityManager.ts'],
      symbols: ['buildResumeContext'],
      task: 'Wire richer resume output',
      decision: 'Defer checkpoint restore',
    })
    await manager.addTask('Ship /resume snapshot')

    const snapshot = manager.buildResumeSnapshot()
    const context = manager.buildResumeContext()

    expect(snapshot?.recentFiles).toEqual([
      'src/services/memory/sessionContinuityManager.ts',
    ])
    expect(snapshot?.recentSymbols).toEqual(['buildResumeContext'])
    expect(snapshot?.recentTasks).toEqual(['Wire richer resume output'])
    expect(snapshot?.recentDecisions).toEqual(['Defer checkpoint restore'])
    expect(snapshot?.suggestedResumeNotes).toContain(
      'Continue task: Ship /resume snapshot',
    )
    expect(manager.getChangedWorkSinceLastSession()).toEqual([
      'src/services/memory/sessionContinuityManager.ts',
    ])
    expect(context).toContain('## Resume Snapshot')
    expect(context).toContain('Wire richer resume output')
  })
})
