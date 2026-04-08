import type { DangerousBackend, DangerousSession } from './backends/dangerousBackend.js'
import type { SessionInfo } from './types.js'

export class SessionManager {
  private sessions = new Map<string, SessionInfo>()

  constructor(
    private backend: DangerousBackend,
    _options?: { idleTimeoutMs?: number; maxSessions?: number },
  ) {}

  async create(input: {
    cwd: string
    dangerouslySkipPermissions?: boolean
  }): Promise<DangerousSession> {
    const session = await this.backend.createSession(input)
    this.sessions.set(session.sessionId, {
      id: session.sessionId,
      status: 'running',
      createdAt: session.createdAt,
      workDir: session.cwd,
      process: null,
    })
    return session
  }

  get(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId)
  }

  async destroy(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  async destroyAll(): Promise<void> {
    this.sessions.clear()
  }
}
