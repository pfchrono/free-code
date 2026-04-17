import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'path'
import {
  createHeadlessSessionHarness,
  type HeadlessHarnessEvent,
  type HeadlessHarnessTurn,
  type HeadlessSessionHarness,
} from '../headless/sessionHarness.js'

const PROTO_PATH = path.resolve(import.meta.dirname, '../proto/openclaude.proto')

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
})

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any
const openclaudeProto = protoDescriptor.openclaude.v1

const MAX_SESSIONS = 1000

type ActiveStreamState = {
  session: HeadlessSessionHarness
  turn: HeadlessHarnessTurn | null
  interrupted: boolean
}

export class GrpcServer {
  private server: grpc.Server
  private sessions = new Map<string, HeadlessSessionHarness>()
  private activeStreams = new Set<ActiveStreamState>()
  private isStopping = false

  constructor() {
    this.server = new grpc.Server()
    this.server.addService(openclaudeProto.AgentService.service, {
      Chat: this.handleChat.bind(this),
    })
  }

  async start(port = 50051, host = 'localhost'): Promise<number> {
    const boundPort = await new Promise<number>((resolve, reject) => {
      this.server.bindAsync(
        `${host}:${port}`,
        grpc.ServerCredentials.createInsecure(),
        (error, actualPort) => {
          if (error) {
            reject(error)
            return
          }
          resolve(actualPort)
        },
      )
    })

    console.log(`gRPC server running at ${host}:${boundPort}`)
    return boundPort
  }

  async stop(graceMs = 2_000): Promise<void> {
    if (this.isStopping) {
      return
    }
    this.isStopping = true

    for (const stream of this.activeStreams) {
      stream.interrupted = true
      stream.session.interrupt()
    }

    await new Promise<void>(resolve => {
      let settled = false
      const finish = (): void => {
        if (settled) {
          return
        }
        settled = true
        resolve()
      }

      const forceTimer = setTimeout(() => {
        try {
          this.server.forceShutdown()
        } finally {
          finish()
        }
      }, graceMs)

      this.server.tryShutdown(error => {
        clearTimeout(forceTimer)
        if (error) {
          this.server.forceShutdown()
        }
        finish()
      })
    })
  }

  private getSession(sessionId: string, cwd: string): HeadlessSessionHarness {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      return existing
    }

    if (this.sessions.size >= MAX_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value
      if (oldestKey !== undefined) {
        this.sessions.delete(oldestKey)
      }
    }

    const created = createHeadlessSessionHarness({ cwd })
    this.sessions.set(sessionId, created)
    return created
  }

  private async streamTurnEvents(
    call: grpc.ServerDuplexStream<any, any>,
    turn: HeadlessHarnessTurn,
    state: ActiveStreamState,
  ): Promise<void> {
    for await (const event of turn.events()) {
      this.writeGrpcEvent(call, event)
    }

    await turn.done

    if (this.activeStreams.has(state)) {
      state.turn = null
    }
  }

  private writeGrpcEvent(
    call: grpc.ServerDuplexStream<any, any>,
    event: HeadlessHarnessEvent,
  ): void {
    switch (event.type) {
      case 'message_delta':
        call.write({
          text_chunk: {
            text: event.delta,
          },
        })
        return
      case 'tool_use':
        call.write({
          tool_start: {
            tool_name: event.tool,
            arguments_json: JSON.stringify(event.input),
            tool_use_id: event.toolUseId,
          },
        })
        return
      case 'tool_result':
        call.write({
          tool_result: {
            tool_name: event.tool,
            tool_use_id: event.toolUseId,
            output: event.output,
            is_error: !event.success,
          },
        })
        return
      case 'permission_request':
        call.write({
          action_required: {
            prompt_id: event.requestId,
            question: event.question,
            type: 'CONFIRM_COMMAND',
          },
        })
        return
      case 'error':
        call.write({
          error: {
            message: event.message,
            code: event.code ?? 'INTERNAL',
          },
        })
        return
      case 'completion':
        call.write({
          done: {
            full_text: event.output,
            prompt_tokens: event.inputTokens,
            completion_tokens: event.outputTokens,
          },
        })
        return
      default:
        return
    }
  }

  private handleChat(call: grpc.ServerDuplexStream<any, any>): void {
    const sessionKey = { value: '' }
    const state: ActiveStreamState = {
      session: createHeadlessSessionHarness({
        cwd: process.cwd(),
      }),
      turn: null,
      interrupted: false,
    }
    this.activeStreams.add(state)

    call.on('data', async clientMessage => {
      try {
        if (clientMessage.request) {
          if (state.turn) {
            call.write({
              error: {
                message: 'A request is already in progress on this stream',
                code: 'ALREADY_EXISTS',
              },
            })
            return
          }

          state.interrupted = false

          const req = clientMessage.request
          const cwd = req.working_directory || process.cwd()
          const sessionId = req.session_id || `grpc-${Date.now()}`
          sessionKey.value = sessionId
          state.session = this.getSession(sessionId, cwd)

          if (req.model) {
            state.session.selectModel('', req.model)
          }

          const turn = await state.session.submit(req.message, {
            permissionMode: 'ask',
          })
          state.turn = turn

          void this.streamTurnEvents(call, turn, state).catch(err => {
            call.write({
              error: {
                message: err instanceof Error ? err.message : String(err),
                code: 'INTERNAL',
              },
            })
          })
          return
        }

        if (clientMessage.input) {
          const ok = state.session.respondToPermission(
            clientMessage.input.prompt_id,
            /^(y|yes)$/i.test(clientMessage.input.reply)
              ? { behavior: 'allow' }
              : { behavior: 'deny', reason: 'User denied via gRPC' },
          )

          if (!ok) {
            call.write({
              error: {
                message: `Unknown permission request: ${clientMessage.input.prompt_id}`,
                code: 'NOT_FOUND',
              },
            })
          }
          return
        }

        if (clientMessage.cancel) {
          state.interrupted = true
          state.session.interrupt()
          call.end()
        }
      } catch (err) {
        console.error('Error processing gRPC stream', err)
        call.write({
          error: {
            message: err instanceof Error ? err.message : 'Internal server error',
            code: 'INTERNAL',
          },
        })
        call.end()
      }
    })

    call.on('end', () => {
      state.interrupted = true
      state.session.interrupt()
      this.activeStreams.delete(state)
    })

    call.on('close', () => {
      state.interrupted = true
      state.session.interrupt()
      this.activeStreams.delete(state)
    })
  }
}
