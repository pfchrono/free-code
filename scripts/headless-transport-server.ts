import readline from 'node:readline'
import { createHeadlessSessionHarness, type HeadlessHarnessEvent } from '../src/headless/sessionHarness.js'

type TransportRequest = {
  id: string
  input?: string
  command?: string
  cwd?: string
  sessionId?: string
  permissionMode?: 'allow' | 'deny' | 'ask'
}

type TransportSession = ReturnType<typeof createHeadlessSessionHarness>

const MAX_SESSIONS = 32
const DEFAULT_SESSION_ID = 'default'
const sessions = new Map<string, TransportSession>()

function getSession(sessionId: string, cwd?: string): TransportSession {
  const existing = sessions.get(sessionId)
  if (existing) {
    return existing
  }

  if (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value
    if (oldest !== undefined) {
      sessions.delete(oldest)
    }
  }

  const created = createHeadlessSessionHarness({
    cwd: cwd ?? process.cwd(),
  })
  sessions.set(sessionId, created)
  return created
}

function writeMessage(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

async function streamRequest(request: TransportRequest): Promise<void> {
  const session = getSession(request.sessionId ?? DEFAULT_SESSION_ID, request.cwd)
  const input = request.input ?? request.command

  if (!input) {
    writeMessage({
      id: request.id,
      type: 'error',
      ok: false,
      error: 'Request must include input or command',
    })
    return
  }

  const turn = await session.submit(input, {
    permissionMode: request.permissionMode ?? 'allow',
  })

  for await (const event of turn.events()) {
    writeMessage({
      id: request.id,
      type: 'event',
      event,
    })
  }

  await turn.done

  writeMessage({
    id: request.id,
    type: 'done',
    ok: true,
  })
}

function handlePermissionReply(payload: {
  id: string
  sessionId?: string
  requestId: string
  decision: 'allow' | 'deny'
  reason?: string
}): void {
  const session = sessions.get(payload.sessionId ?? DEFAULT_SESSION_ID)
  if (!session) {
    writeMessage({
      id: payload.id,
      type: 'error',
      ok: false,
      error: 'Session not found',
    })
    return
  }

  const ok = session.respondToPermission(
    payload.requestId,
    payload.decision === 'allow'
      ? { behavior: 'allow' }
      : { behavior: 'deny', reason: payload.reason },
  )

  writeMessage({
    id: payload.id,
    type: 'permission_ack',
    ok,
  })
}

function handleInterrupt(payload: { id: string; sessionId?: string }): void {
  const session = sessions.get(payload.sessionId ?? DEFAULT_SESSION_ID)
  const ok = session?.interrupt() ?? false
  writeMessage({
    id: payload.id,
    type: 'interrupt_ack',
    ok,
  })
}

async function main(): Promise<void> {
  writeMessage({
    type: 'ready',
    transport: 'headless-session-harness',
    protocol: 'jsonl',
  })

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })

  rl.on('line', line => {
    void (async () => {
      const trimmed = line.trim()
      if (!trimmed) {
        return
      }

      try {
        const payload = JSON.parse(trimmed) as
          | (TransportRequest & { type?: 'request' })
          | {
              type: 'permission_response'
              id: string
              sessionId?: string
              requestId: string
              decision: 'allow' | 'deny'
              reason?: string
            }
          | { type: 'interrupt'; id: string; sessionId?: string }

        if (payload.type === 'permission_response') {
          handlePermissionReply(payload)
          return
        }

        if (payload.type === 'interrupt') {
          handleInterrupt(payload)
          return
        }

        if (typeof payload.id !== 'string') {
          throw new Error('Request must include string id field')
        }

        await streamRequest(payload)
      } catch (error) {
        writeMessage({
          id: 'unknown',
          type: 'error',
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })()
  })

  await new Promise<void>(resolve => {
    rl.on('close', resolve)
  })
}

main().catch(error => {
  writeMessage({
    type: 'fatal',
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
