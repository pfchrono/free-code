import type { ServerConfig } from './types.js'
import type { SessionManager } from './sessionManager.js'

type ServerLogger = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

type RunningServer = {
  port?: number
  stop: (_force?: boolean) => void
}

function getHttpUrl(config: ServerConfig, port: number): string {
  return `http://${config.host}:${port}`
}

export function startServer(
  config: ServerConfig,
  sessionManager: SessionManager,
  logger: ServerLogger,
): RunningServer {
  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    async fetch(req: Request) {
      const url = new URL(req.url)

      if (req.headers.get('authorization') !== `Bearer ${config.authToken}`) {
        return new Response('Unauthorized', { status: 401 })
      }

      if (req.method === 'POST' && url.pathname === '/sessions') {
        let body: {
          cwd?: string
          dangerously_skip_permissions?: boolean
        }
        try {
          body = (await req.json()) as typeof body
        } catch {
          return new Response('Invalid JSON', { status: 400 })
        }

        const cwd = body.cwd || config.workspace || process.cwd()
        const session = await sessionManager.create({
          cwd,
          dangerouslySkipPermissions: body.dangerously_skip_permissions,
        })

        const actualPort = typeof server.port === 'number' ? server.port : config.port
        const baseUrl = getHttpUrl(config, actualPort)
        const wsProtocol = baseUrl.startsWith('https://') ? 'wss://' : 'ws://'
        const wsBase = baseUrl.replace(/^https?:\/\//, wsProtocol)

        logger.info(`Created direct-connect session ${session.sessionId}`)

        return Response.json({
          session_id: session.sessionId,
          ws_url: `${wsBase}/sessions/${session.sessionId}/ws`,
          work_dir: session.cwd,
        })
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        return Response.json({ ok: true })
      }

      return new Response('Not found', { status: 404 })
    },
  })

  return {
    port: server.port,
    stop() {
      server.stop(true)
    },
  }
}
