import { spawn } from 'node:child_process'
import readline from 'node:readline'

type TransportEnvelope =
  | {
      type: 'ready'
      transport: string
      commands: string[]
    }
  | {
      id: string
      ok: boolean
      output?: string
      error?: string
    }

function waitForResponse(
  rl: readline.Interface,
  predicate: (payload: TransportEnvelope) => boolean,
  timeoutMs: number,
): Promise<TransportEnvelope> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for transport response`))
    }, timeoutMs)

    const onLine = (line: string): void => {
      try {
        const payload = JSON.parse(line) as TransportEnvelope
        if (predicate(payload)) {
          cleanup()
          resolve(payload)
        }
      } catch {
        // Ignore non-JSON lines.
      }
    }

    const cleanup = (): void => {
      clearTimeout(timer)
      rl.off('line', onLine)
    }

    rl.on('line', onLine)
  })
}

async function main(): Promise<void> {
  const child = spawn(
    'bun',
    ['run', './scripts/headless-transport-server.ts'],
    {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'inherit'],
    },
  )

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  })

  try {
    await waitForResponse(
      rl,
      payload => payload.type === 'ready',
      10000,
    )

    child.stdin.write(
      `${JSON.stringify({
        id: 'deadpool-status',
        command: '/deadpoolmode status',
        sessionId: 'smoke',
      })}\n`,
    )

    const statusResponse = await waitForResponse(
      rl,
      payload => payload.id === 'deadpool-status',
      10000,
    )

    if (
      !statusResponse.ok ||
      !statusResponse.output?.includes('Deadpool mode') ||
      !statusResponse.output.includes('Style stack:')
    ) {
      throw new Error(
        `Unexpected /deadpoolmode status response: ${JSON.stringify(statusResponse)}`,
      )
    }

    child.stdin.write(
      `${JSON.stringify({
        id: 'caveman-on',
        command: '/caveman-mode on',
        sessionId: 'smoke',
      })}\n`,
    )

    const cavemanResponse = await waitForResponse(
      rl,
      payload => payload.id === 'caveman-on',
      10000,
    )

    if (
      !cavemanResponse.ok ||
      !cavemanResponse.output?.includes('Caveman mode ON')
    ) {
      throw new Error(
        `Unexpected /caveman-mode on response: ${JSON.stringify(cavemanResponse)}`,
      )
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          results: [statusResponse, cavemanResponse],
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
