import { randomUUID } from 'crypto'

export type DangerousSession = {
  sessionId: string
  cwd: string
  createdAt: number
  dangerouslySkipPermissions: boolean
}

export class DangerousBackend {
  async createSession(input: {
    cwd: string
    dangerouslySkipPermissions?: boolean
  }): Promise<DangerousSession> {
    return {
      sessionId: randomUUID(),
      cwd: input.cwd,
      createdAt: Date.now(),
      dangerouslySkipPermissions: !!input.dangerouslySkipPermissions,
    }
  }
}
