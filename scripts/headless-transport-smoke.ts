import { spawn } from 'node:child_process'
import readline from 'node:readline'

type TransportEnvelope =
  | {
      type: 'ready'
      transport: string
      protocol: string
    }
  | {
      id: string
      type: 'event'
      event: {
        type: string
        content?: string
        output?: string
        status?: string
      }
    }
  | {
      id: string
      type: 'done'
      ok: boolean
    }
  | {
      id: string
      type: 'error'
      ok: boolean
      error: string
    }

function waitForEnvelope(
  _rl: readline.Interface,
  predicate: (payload: TransportEnvelope) => boolean,
  timeoutMs: number,
  buffer: TransportEnvelope[],
): Promise<TransportEnvelope> {
  return new Promise((resolve, reject) => {
    const tryConsume = (): boolean => {
      const index = buffer.findIndex(predicate)
      if (index === -1) {
        return false
      }
      const [payload] = buffer.splice(index, 1)
      cleanup()
      resolve(payload as TransportEnvelope)
      return true
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for transport response`))
    }, timeoutMs)
    const interval = setInterval(() => {
      void tryConsume()
    }, 10)

    const cleanup = (): void => {
      clearTimeout(timer)
      clearInterval(interval)
    }

    void tryConsume()
  })
}

async function collectRequestEvents(
  child: ReturnType<typeof spawn>,
  rl: readline.Interface,
  payload: Record<string, unknown>,
  buffer: TransportEnvelope[],
): Promise<TransportEnvelope[]> {
  const seen: TransportEnvelope[] = []
  const requestId = String(payload.id)

  child.stdin.write(`${JSON.stringify(payload)}\n`)

  while (true) {
    const envelope = await waitForEnvelope(
      rl,
      message => 'id' in message && message.id === requestId,
      10000,
      buffer,
    )
    seen.push(envelope)

    if (envelope.type === 'done' || envelope.type === 'error') {
      return seen
    }
  }
}

async function main(): Promise<void> {
  const child = spawn('bun', ['run', './scripts/headless-transport-server.ts'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  })
  const buffer: TransportEnvelope[] = []

  try {
    rl.on('line', line => {
      try {
        buffer.push(JSON.parse(line) as TransportEnvelope)
      } catch {
        // ignore
      }
    })

    await waitForEnvelope(rl, payload => payload.type === 'ready', 10000, buffer)

    const statusEvents = await collectRequestEvents(child, rl, {
      id: 'deadpool-status',
      input: '/deadpoolmode status',
      sessionId: 'smoke',
    }, buffer)

    const statusMessage = statusEvents.find(
      event =>
        event.type === 'event' &&
        event.event.type === 'message' &&
        event.event.content?.includes('Deadpool mode'),
    )
    if (
      !statusMessage ||
      !statusMessage.event.content?.includes('Deadpool mode') ||
      !statusMessage.event.content.includes('Style stack:')
    ) {
      throw new Error(`Unexpected /deadpoolmode status event stream: ${JSON.stringify(statusEvents)}`)
    }

    const cavemanEvents = await collectRequestEvents(child, rl, {
      id: 'caveman-on',
      input: '/caveman-mode on',
      sessionId: 'smoke',
    }, buffer)

    const cavemanMessage = cavemanEvents.find(
      event =>
        event.type === 'event' &&
        event.event.type === 'message' &&
        event.event.content?.includes('Caveman mode ON'),
    )
    if (
      !cavemanMessage ||
      !cavemanMessage.event.content?.includes('Caveman mode ON')
    ) {
      throw new Error(`Unexpected /caveman-mode on event stream: ${JSON.stringify(cavemanEvents)}`)
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          statusEvents,
          cavemanEvents,
        },
        null,
        2,
      ),
    )
  } finally {
    rl.close()
    child.kill()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
