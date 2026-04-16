import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'path'
import { randomUUID } from 'crypto'
import { getCommands } from '../commands.js'
import { QueryEngine } from '../QueryEngine.js'
import { getDefaultAppState, type AppState } from '../state/AppStateStore.js'
import { getTools } from '../tools.js'
import {
  FileStateCache,
  READ_FILE_STATE_CACHE_SIZE,
} from '../utils/fileStateCache.js'
import { runHeadlessLocalSlashCommand } from '../utils/headlessLocalCommandRunner.js'

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

export class GrpcServer {
  private server: grpc.Server
  private sessions = new Map<string, any[]>()
  private activeEngines = new Set<QueryEngine>()
  private isStopping = false

  constructor() {
    this.server = new grpc.Server()
    this.server.addService(openclaudeProto.AgentService.service, {
      Chat: this.handleChat.bind(this),
    })
  }

  start(port = 50051, host = 'localhost'): void {
    this.server.bindAsync(
      `${host}:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (error, boundPort) => {
        if (error) {
          console.error('Failed to start gRPC server', error)
          return
        }
        console.log(`gRPC server running at ${host}:${boundPort}`)
      },
    )
  }

  async stop(graceMs = 2_000): Promise<void> {
    if (this.isStopping) {
      return
    }
    this.isStopping = true

    for (const engine of this.activeEngines) {
      engine.interrupt()
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

  private handleChat(call: grpc.ServerDuplexStream<any, any>): void {
    let engine: QueryEngine | null = null
    let appState: AppState = getDefaultAppState()
    const fileCache = new FileStateCache(
      READ_FILE_STATE_CACHE_SIZE,
      25 * 1024 * 1024,
    )
    const pendingRequests = new Map<string, (reply: string) => void>()
    let previousMessages: any[] = []
    let sessionId = ''
    let interrupted = false

    call.on('data', async clientMessage => {
      try {
        if (clientMessage.request) {
          if (engine) {
            call.write({
              error: {
                message: 'A request is already in progress on this stream',
                code: 'ALREADY_EXISTS',
              },
            })
            return
          }

          interrupted = false
          const req = clientMessage.request
          sessionId = req.session_id || ''
          previousMessages = []

          if (sessionId && this.sessions.has(sessionId)) {
            previousMessages = [...this.sessions.get(sessionId)!]
          }

          const toolNameById = new Map<string, string>()
          const cwd = req.working_directory || process.cwd()
          const commands = await getCommands(cwd)
          const directLocalCommand = await runHeadlessLocalSlashCommand(
            req.message,
            {
              cwd,
              appState,
              setAppState: updater => {
                appState = updater(appState)
              },
              messages: previousMessages,
              fileCache,
            },
          )

          if (directLocalCommand) {
            const { result } = directLocalCommand
            call.write({
              done: {
                full_text:
                  result.type === 'text'
                    ? result.value
                    : result.type === 'compact'
                      ? result.displayText ?? ''
                      : '',
                prompt_tokens: 0,
                completion_tokens: 0,
              },
            })
            return
          }

          engine = new QueryEngine({
            cwd,
            tools: getTools(appState.toolPermissionContext),
            commands,
            mcpClients: [],
            agents: [],
            ...(previousMessages.length > 0
              ? { initialMessages: previousMessages }
              : {}),
            includePartialMessages: true,
            canUseTool: async (tool, input, context, assistantMsg, toolUseID) => {
              void context
              void assistantMsg
              if (toolUseID) {
                toolNameById.set(toolUseID, tool.name)
              }

              call.write({
                tool_start: {
                  tool_name: tool.name,
                  arguments_json: JSON.stringify(input),
                  tool_use_id: toolUseID,
                },
              })

              const promptId = randomUUID()
              call.write({
                action_required: {
                  prompt_id: promptId,
                  question: `Approve ${tool.name}?`,
                  type: 'CONFIRM_COMMAND',
                },
              })

              return new Promise(resolve => {
                pendingRequests.set(promptId, reply => {
                  if (reply.toLowerCase() === 'yes' || reply.toLowerCase() === 'y') {
                    resolve({ behavior: 'allow' })
                  } else {
                    resolve({
                      behavior: 'deny',
                      reason: 'User denied via gRPC',
                    })
                  }
                })
              })
            },
            getAppState: () => appState,
            setAppState: updater => {
              appState = updater(appState)
            },
            readFileCache: fileCache,
            userSpecifiedModel: req.model,
            fallbackModel: req.model,
          })
          this.activeEngines.add(engine)

          let fullText = ''
          let promptTokens = 0
          let completionTokens = 0

          for await (const msg of engine.submitMessage(req.message)) {
            if (msg.type === 'stream_event') {
              if (
                msg.event.type === 'content_block_delta' &&
                msg.event.delta.type === 'text_delta'
              ) {
                call.write({
                  text_chunk: {
                    text: msg.event.delta.text,
                  },
                })
                fullText += msg.event.delta.text
              }
            } else if (msg.type === 'user') {
              const content = msg.message.content
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'tool_result') {
                    let outputStr = ''
                    if (typeof block.content === 'string') {
                      outputStr = block.content
                    } else if (Array.isArray(block.content)) {
                      outputStr = block.content
                        .map(c => (c.type === 'text' ? c.text : ''))
                        .join('\n')
                    }
                    call.write({
                      tool_result: {
                        tool_name:
                          toolNameById.get(block.tool_use_id) ?? block.tool_use_id,
                        tool_use_id: block.tool_use_id,
                        output: outputStr,
                        is_error: block.is_error || false,
                      },
                    })
                  }
                }
              }
            } else if (msg.type === 'result' && msg.subtype === 'success') {
              if (msg.result) {
                fullText = msg.result
              }
              promptTokens = msg.usage?.input_tokens ?? 0
              completionTokens = msg.usage?.output_tokens ?? 0
            }
          }

          if (!interrupted) {
            previousMessages = [...engine.getMessages()]
            if (sessionId) {
              if (!this.sessions.has(sessionId) && this.sessions.size >= MAX_SESSIONS) {
                const oldestKey = this.sessions.keys().next().value
                if (oldestKey !== undefined) {
                  this.sessions.delete(oldestKey)
                }
              }
              this.sessions.set(sessionId, previousMessages)
            }

            call.write({
              done: {
                full_text: fullText,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
              },
            })
          }

          if (engine) {
            this.activeEngines.delete(engine)
          }
          engine = null
        } else if (clientMessage.input) {
          const promptId = clientMessage.input.prompt_id
          const reply = clientMessage.input.reply
          const resolve = pendingRequests.get(promptId)
          if (resolve) {
            resolve(reply)
            pendingRequests.delete(promptId)
          }
        } else if (clientMessage.cancel) {
          interrupted = true
          engine?.interrupt()
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
      interrupted = true
      for (const resolve of pendingRequests.values()) {
        resolve('no')
      }
      if (engine) {
        engine.interrupt()
        this.activeEngines.delete(engine)
      }
      engine = null
      pendingRequests.clear()
    })
  }
}
