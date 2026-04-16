import readline from 'node:readline'
import cavemanMode from '../src/commands/caveman-mode/index.ts'
import deadpoolMode from '../src/commands/deadpoolmode/index.ts'
import {
  FileStateCache,
  READ_FILE_STATE_CACHE_SIZE,
} from '../src/utils/fileStateCache.js'
import { runHeadlessLocalSlashCommand } from '../src/utils/headlessLocalCommandRunner.js'

type TransportRequest = {
  id: string
  command: string
  cwd?: string
  sessionId?: string
}

type SessionState = {
  appState: Record<string, unknown>
  messages: any[]
  fileCache: FileStateCache
}

const MAX_SESSIONS = 32
const DEFAULT_SESSION_ID = 'default'
const sessions = new Map<string, SessionState>()

function getSession(sessionId: string): SessionState {
  const existing = sessions.get(sessionId)
  if (existing) {
    return existing
  }

  if (sessions.size >= MAX_SESSIONS) {
    const oldestSessionId = sessions.keys().next().value
    if (oldestSessionId !== undefined) {
      sessions.delete(oldestSessionId)
    }
  }

  const created: SessionState = {
    appState: {},
    messages: [],
    fileCache: new FileStateCache(READ_FILE_STATE_CACHE_SIZE, 25 * 1024 * 1024),
  }
  sessions.set(sessionId, created)
  return created
}

function writeMessage(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function getOutputText(result: {
  type: 'text' | 'compact' | 'skip'
  value?: string
  displayText?: string
}): string {
  if (result.type === 'text') {
    return result.value ?? ''
  }
  if (result.type === 'compact') {
    return result.displayText ?? ''
  }
  return ''
}

async function handleRequest(request: TransportRequest): Promise<void> {
  const session = getSession(request.sessionId ?? DEFAULT_SESSION_ID)
  const cwd = request.cwd ?? process.cwd()

  const resolved = await runHeadlessLocalSlashCommand(request.command, {
    cwd,
    appState: session.appState,
    setAppState: updater => {
      session.appState = updater(session.appState)
      return session.appState
    },
    messages: session.messages,
    fileCache: session.fileCache,
    commands: [deadpoolMode, cavemanMode],
    theme: 'dark',
  })

  if (!resolved) {
    writeMessage({
      id: request.id,
      ok: false,
      error:
        'Unsupported command for headless transport. Current transport supports /deadpoolmode and /caveman-mode.',
    })
    return
  }

  writeMessage({
    id: request.id,
    ok: true,
    command: resolved.command.name,
    args: resolved.parsedArgs,
    output: getOutputText(resolved.result),
    resultType: resolved.result.type,
  })
}

async function main(): Promise<void> {
  writeMessage({
    type: 'ready',
    transport: 'headless-local-command',
    commands: ['deadpoolmode', 'caveman-mode'],
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
        const request = JSON.parse(trimmed) as Partial<TransportRequest>
        if (
          typeof request.id !== 'string' ||
          typeof request.command !== 'string'
        ) {
          throw new Error('Request must include string id and command fields')
        }

        await handleRequest({
          id: request.id,
          command: request.command,
          cwd: request.cwd,
          sessionId: request.sessionId,
        })
      } catch (error) {
        writeMessage({
          id: 'unknown',
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
