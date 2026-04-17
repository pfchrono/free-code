import { randomUUID } from 'node:crypto'
import cavemanMode from '../commands/caveman-mode/index.ts'
import deadpoolMode from '../commands/deadpoolmode/index.ts'
import { getCommands } from '../commands.js'
import { QueryEngine, type QueryEngineConfig } from '../QueryEngine.js'
import { getOriginalCwd, setMainLoopModelOverride } from '../bootstrap/state.js'
import type { SDKMessage, SDKResultMessage, SDKStatus } from '../entrypoints/agentSdkTypes.js'
import { getDefaultAppState, type AppState } from '../state/AppStateStore.js'
import type { Command, LocalCommandResult } from '../types/command.js'
import { getTools } from '../tools.js'
import { getEmptyToolPermissionContext } from '../Tool.js'
import {
  FileStateCache,
  READ_FILE_STATE_CACHE_SIZE,
  createFileStateCacheWithSizeLimit,
  type FileStateCache as FileStateCacheType,
} from '../utils/fileStateCache.js'
import { extractTextContent } from '../utils/messages.js'
import { parseUserSpecifiedModel } from '../utils/model/model.js'
import { getModelOptions } from '../utils/model/modelOptions.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { runHeadlessLocalSlashCommand } from '../utils/headlessLocalCommandRunner.js'
import { withResolvers } from '../utils/withResolvers.js'

export type HeadlessHarnessPermissionDecision =
  | { behavior: 'allow' }
  | { behavior: 'deny'; reason?: string }

export type HeadlessHarnessPermissionMode =
  | 'allow'
  | 'deny'
  | 'ask'

export type HeadlessHarnessEvent =
  | {
      type: 'message'
      role: 'user' | 'assistant' | 'system'
      content: string
      timestamp: number
    }
  | {
      type: 'message_delta'
      role: 'assistant'
      delta: string
      timestamp: number
    }
  | {
      type: 'tool_use'
      tool: string
      input: Record<string, unknown>
      toolUseId?: string
      timestamp: number
    }
  | {
      type: 'tool_result'
      tool: string
      toolUseId?: string
      output: string
      success: boolean
      timestamp: number
    }
  | {
      type: 'permission_request'
      requestId: string
      tool: string
      toolUseId?: string
      input: Record<string, unknown>
      question: string
      timestamp: number
    }
  | {
      type: 'status'
      message: string
      level: 'info' | 'warning' | 'error'
      timestamp: number
    }
  | {
      type: 'error'
      message: string
      code?: string
      timestamp: number
    }
  | {
      type: 'completion'
      status: 'success' | 'error' | 'interrupted'
      output: string
      inputTokens: number
      outputTokens: number
      durationMs: number
      errors?: string[]
      timestamp: number
    }

export type HeadlessHarnessTurn = {
  id: string
  events(): AsyncGenerator<HeadlessHarnessEvent>
  done: Promise<void>
}

export type HeadlessHarnessSubmitOptions = {
  permissionMode?: HeadlessHarnessPermissionMode
}

export type HeadlessSessionHarnessOptions = {
  cwd?: string
  commands?: Command[]
  createQueryEngine?: (config: QueryEngineConfig) => HeadlessQueryEngine
  initialAppState?: AppState
  model?: string
}

type HeadlessQueryEngine = Pick<
  QueryEngine,
  'submitMessage' | 'interrupt' | 'getMessages' | 'getReadFileState'
>

type PendingPermissionRequest = {
  requestId: string
  resolve: (decision: HeadlessHarnessPermissionDecision) => void
}

type PermissionHandlerOptions = {
  turn: ActiveTurnState
  permissionMode: HeadlessHarnessPermissionMode
  emit: (event: HeadlessHarnessEvent) => void
}

type ActiveTurnState = {
  id: string
  queue: AsyncEventQueue<HeadlessHarnessEvent>
  done: Promise<void>
  finish: () => void
  engine: HeadlessQueryEngine | null
  interrupted: boolean
  completionEmitted: boolean
  toolUseIdsEmitted: Set<string>
  toolNameByUseId: Map<string, string>
  pendingPermissions: Map<string, PendingPermissionRequest>
}

class AsyncEventQueue<T> {
  private items: T[] = []
  private waiters: Array<(value: IteratorResult<T>) => void> = []
  private ended = false

  push(item: T): void {
    if (this.ended) {
      return
    }
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  close(): void {
    this.ended = true
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ value: undefined as T, done: true })
    }
  }

  async *iterate(): AsyncGenerator<T> {
    while (true) {
      if (this.items.length > 0) {
        yield this.items.shift() as T
        continue
      }

      if (this.ended) {
        return
      }

      const next = await new Promise<IteratorResult<T>>(resolve => {
        this.waiters.push(resolve)
      })

      if (next.done) {
        return
      }

      yield next.value
    }
  }
}

function createCommandOutputText(result: LocalCommandResult): string {
  if (result.type === 'text') {
    return result.value
  }
  if (result.type === 'compact') {
    return result.displayText ?? ''
  }
  return ''
}

function formatSdkStatus(status: SDKStatus): string {
  if (status === null) {
    return 'Ready'
  }
  if (status === 'compacting') {
    return 'Compacting conversation...'
  }
  return String(status)
}

function getUsageNumber(
  usage: Record<string, unknown> | undefined,
  kind: 'input' | 'output',
): number {
  if (!usage) {
    return 0
  }

  const keys =
    kind === 'input'
      ? ['input_tokens', 'inputTokens']
      : ['output_tokens', 'outputTokens']

  for (const key of keys) {
    const value = usage[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return 0
}

function getToolResultOutput(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const text = extractTextContent(
      content.filter(
        block =>
          typeof block === 'object' &&
          block !== null &&
          (block as Record<string, unknown>).type === 'text' &&
          typeof (block as Record<string, unknown>).text === 'string',
      ) as Array<{ type: string; text: string }>,
      '\n',
    ).trim()

    if (text) {
      return text
    }
  }

  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function createFallbackAppState(): AppState {
  return {
    settings: {} as never,
    tasks: {},
    agentNameRegistry: new Map(),
    verbose: false,
    mainLoopModel: null,
    mainLoopModelForSession: null,
    statusLineText: undefined,
    expandedView: 'none',
    isBriefOnly: false,
    showTeammateMessagePreview: false,
    selectedIPAgentIndex: -1,
    coordinatorTaskIndex: -1,
    viewSelectionMode: 'none',
    footerSelection: null,
    kairosEnabled: false,
    remoteSessionUrl: undefined,
    remoteConnectionStatus: 'connecting',
    remoteBackgroundTaskCount: 0,
    replBridgeEnabled: false,
    replBridgeExplicit: false,
    replBridgeOutboundOnly: false,
    replBridgeConnected: false,
    replBridgeSessionActive: false,
    replBridgeReconnecting: false,
    replBridgeConnectUrl: undefined,
    replBridgeSessionUrl: undefined,
    replBridgeEnvironmentId: undefined,
    replBridgeSessionId: undefined,
    replBridgeError: undefined,
    replBridgeInitialName: undefined,
    showRemoteCallout: false,
    companionMuted: false,
    toolPermissionContext: getEmptyToolPermissionContext(),
    agent: undefined,
    agentDefinitions: { activeAgents: [], allAgents: [] },
    fileHistory: {
      snapshots: [],
      trackedFiles: new Set(),
      snapshotSequence: 0,
    },
    attribution: {
      attributedCommands: new Set(),
      attributedPaths: new Set(),
      hasDisabledAttributionMessage: false,
      hasSeenOnboardingMessage: false,
      currentBranchHasChanges: false,
    },
    mcp: {
      clients: [],
      tools: [],
      commands: [],
      resources: {},
      pluginReconnectKey: 0,
    },
    plugins: {
      enabled: [],
      disabled: [],
      commands: [],
      errors: [],
      installationStatus: {
        marketplaces: [],
        plugins: [],
      },
      needsRefresh: false,
    },
  } as AppState
}

function createInitialAppState(): AppState {
  try {
    return getDefaultAppState()
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Config accessed before allowed.'
    ) {
      return createFallbackAppState()
    }
    throw error
  }
}

export class HeadlessSessionHarness {
  private cwd: string
  private commands: Command[] | null
  private appState: AppState
  private messages: any[]
  private readFileCache: FileStateCacheType
  private currentModel: string | undefined
  private activeTurn: ActiveTurnState | null = null
  private readonly createQueryEngine: (config: QueryEngineConfig) => HeadlessQueryEngine

  constructor(options: HeadlessSessionHarnessOptions = {}) {
    this.cwd = options.cwd ?? getOriginalCwd()
    this.commands = options.commands ?? null
    this.appState = options.initialAppState ?? createInitialAppState()
    this.messages = []
    this.readFileCache = createFileStateCacheWithSizeLimit(
      READ_FILE_STATE_CACHE_SIZE,
    )
    this.currentModel = options.model
    this.createQueryEngine =
      options.createQueryEngine ??
      ((config: QueryEngineConfig) => new QueryEngine(config))
  }

  async refreshCommands(): Promise<Command[]> {
    try {
      this.commands = await getCommands(this.cwd)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Config accessed before allowed.'
      ) {
        this.commands = [deadpoolMode, cavemanMode]
      } else {
        throw error
      }
    }
    return this.commands
  }

  async getCommands(): Promise<Command[]> {
    return this.commands ?? this.refreshCommands()
  }

  getModels(): Array<{ id: string; name: string; provider: string }> {
    return getModelOptions().map(option => ({
      id: String(option.value),
      name: option.label,
      provider: getAPIProvider(),
    }))
  }

  selectModel(provider: string, model: string): {
    appliedModel: string
    providerWarning?: string
  } {
    const activeProvider = getAPIProvider()
    const providerWarning =
      provider && provider !== activeProvider
        ? `Provider switch not supported in shared headless harness yet. Keeping ${activeProvider}.`
        : undefined

    const parsedModel = parseUserSpecifiedModel(model)
    setMainLoopModelOverride(parsedModel)
    this.currentModel = parsedModel
    this.appState = {
      ...this.appState,
      mainLoopModel: parsedModel,
      mainLoopModelForSession: parsedModel,
    }

    return {
      appliedModel: String(parsedModel),
      providerWarning,
    }
  }

  async submit(
    input: string,
    options: HeadlessHarnessSubmitOptions = {},
  ): Promise<HeadlessHarnessTurn> {
    if (this.activeTurn) {
      throw new Error('A harness turn is already in progress')
    }

    const queue = new AsyncEventQueue<HeadlessHarnessEvent>()
    const doneResolvers = withResolvers<void>()
    const turn: ActiveTurnState = {
      id: randomUUID(),
      queue,
      done: doneResolvers.promise,
      finish: () => doneResolvers.resolve(),
      engine: null,
      interrupted: false,
      completionEmitted: false,
      toolUseIdsEmitted: new Set(),
      toolNameByUseId: new Map(),
      pendingPermissions: new Map(),
    }
    this.activeTurn = turn

    const emit = (event: HeadlessHarnessEvent): void => {
      queue.push(event)
    }

    emit({
      type: 'message',
      role: 'user',
      content: input,
      timestamp: Date.now(),
    })

    void this.runTurn(turn, input, options, emit)

    return {
      id: turn.id,
      events: () => queue.iterate(),
      done: turn.done,
    }
  }

  respondToPermission(
    requestId: string,
    decision: HeadlessHarnessPermissionDecision,
  ): boolean {
    const turn = this.activeTurn
    if (!turn) {
      return false
    }

    const pending = turn.pendingPermissions.get(requestId)
    if (!pending) {
      return false
    }

    turn.pendingPermissions.delete(requestId)
    pending.resolve(decision)
    return true
  }

  interrupt(): boolean {
    const turn = this.activeTurn
    if (!turn) {
      return false
    }

    turn.interrupted = true
    turn.engine?.interrupt()
    for (const pending of turn.pendingPermissions.values()) {
      pending.resolve({
        behavior: 'deny',
        reason: 'Interrupted before permission response',
      })
    }
    turn.pendingPermissions.clear()
    return true
  }

  private async runTurn(
    turn: ActiveTurnState,
    input: string,
    options: HeadlessHarnessSubmitOptions,
    emit: (event: HeadlessHarnessEvent) => void,
  ): Promise<void> {
    const startedAt = Date.now()

    try {
      const commands = await this.getCommands()
      const canUseTool = this.createPermissionHandler({
        turn,
        permissionMode: options.permissionMode ?? 'allow',
        emit,
      })
      const localResult = await runHeadlessLocalSlashCommand(input, {
        cwd: this.cwd,
        appState: this.appState,
        setAppState: updater => {
          this.appState = updater(this.appState)
          return this.appState
        },
        messages: this.messages,
        fileCache: this.readFileCache,
        commands,
        theme: 'dark',
        canUseTool,
      })

      if (localResult) {
        this.emitLocalCommandTurn(localResult.result, startedAt, emit)
        return
      }

      await this.runPromptTurn(turn, input, options, startedAt, emit, canUseTool)
    } catch (error) {
      emit({
        type: 'error',
        message: toErrorMessage(error),
        code: 'TURN_ERROR',
        timestamp: Date.now(),
      })
      this.emitCompletion(
        turn,
        {
          status: turn.interrupted ? 'interrupted' : 'error',
          output: '',
          inputTokens: 0,
          outputTokens: 0,
          durationMs: Date.now() - startedAt,
          errors: [toErrorMessage(error)],
          timestamp: Date.now(),
        },
        emit,
      )
    } finally {
      if (this.activeTurn?.id === turn.id) {
        this.activeTurn = null
      }
      turn.queue.close()
      turn.finish()
    }
  }

  private emitLocalCommandTurn(
    result: LocalCommandResult,
    startedAt: number,
    emit: (event: HeadlessHarnessEvent) => void,
  ): void {
    const output = createCommandOutputText(result)
    if (output) {
      emit({
        type: 'message',
        role: 'assistant',
        content: output,
        timestamp: Date.now(),
      })
    }
    emit({
      type: 'completion',
      status: 'success',
      output,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - startedAt,
      timestamp: Date.now(),
    })
  }

  private async runPromptTurn(
    turn: ActiveTurnState,
    input: string,
    options: HeadlessHarnessSubmitOptions,
    startedAt: number,
    emit: (event: HeadlessHarnessEvent) => void,
    canUseTool: NonNullable<QueryEngineConfig['canUseTool']>,
  ): Promise<void> {
    const commands = await this.getCommands()

    const engine = this.createQueryEngine({
      cwd: this.cwd,
      tools: getTools(this.appState.toolPermissionContext),
      commands,
      mcpClients: [],
      agents: [],
      ...(this.messages.length > 0 ? { initialMessages: this.messages } : {}),
      includePartialMessages: true,
      canUseTool,
      getAppState: () => this.appState,
      setAppState: updater => {
        this.appState = updater(this.appState)
      },
      readFileCache: this.readFileCache,
      ...(this.currentModel
        ? {
            userSpecifiedModel: this.currentModel,
            fallbackModel: this.currentModel,
          }
        : {}),
    })

    turn.engine = engine

    try {
      for await (const message of engine.submitMessage(input)) {
        this.emitSdkEvents(turn, message, emit)
      }
      this.messages = [...engine.getMessages()]
      this.readFileCache = engine.getReadFileState()

      if (turn.interrupted && !turn.completionEmitted) {
        this.emitCompletion(
          turn,
          {
            type: 'completion',
            status: 'interrupted',
            output: '',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: Date.now() - startedAt,
            timestamp: Date.now(),
          },
          emit,
        )
      }
    } finally {
      turn.engine = null
      for (const pending of turn.pendingPermissions.values()) {
        pending.resolve({
          behavior: 'deny',
          reason: 'Turn finished before permission response',
        })
      }
      turn.pendingPermissions.clear()
    }
  }

  private emitSdkEvents(
    turn: ActiveTurnState,
    message: SDKMessage,
    emit: (event: HeadlessHarnessEvent) => void,
  ): void {
    switch (message.type) {
      case 'stream_event':
        if (
          message.event.type === 'content_block_delta' &&
          message.event.delta.type === 'text_delta'
        ) {
          emit({
            type: 'message_delta',
            role: 'assistant',
            delta: message.event.delta.text,
            timestamp: Date.now(),
          })
        }
        return
      case 'assistant': {
        const content = Array.isArray(message.message?.content)
          ? message.message.content
          : []

        for (const block of content) {
          if (block.type === 'tool_use') {
            turn.toolNameByUseId.set(block.id, block.name)
            if (!turn.toolUseIdsEmitted.has(block.id)) {
              turn.toolUseIdsEmitted.add(block.id)
              emit({
                type: 'tool_use',
                tool: block.name,
                input: isRecord(block.input) ? block.input : {},
                toolUseId: block.id,
                timestamp: Date.now(),
              })
            }
          }
        }

        const text = extractTextContent(
          content.filter(
            block =>
              block.type === 'text' ||
              block.type === 'thinking' ||
              block.type === 'redacted_thinking',
          ) as Array<{ type: string; text: string }>,
          '\n',
        ).trim()

        if (text) {
          emit({
            type: 'message',
            role: 'assistant',
            content: text,
            timestamp: Date.now(),
          })
        }
        return
      }
      case 'user': {
        const content = message.message?.content
        if (!Array.isArray(content)) {
          return
        }

        for (const block of content) {
          if (block.type !== 'tool_result') {
            continue
          }

          emit({
            type: 'tool_result',
            tool: turn.toolNameByUseId.get(block.tool_use_id) ?? block.tool_use_id,
            toolUseId: block.tool_use_id,
            output: getToolResultOutput(block.content),
            success: !Boolean(block.is_error),
            timestamp: Date.now(),
          })
        }
        return
      }
      case 'status':
        emit({
          type: 'status',
          message: formatSdkStatus(message.status),
          level: 'info',
          timestamp: Date.now(),
        })
        return
      case 'system':
        if (message.subtype === 'compact_boundary') {
          emit({
            type: 'status',
            message: 'Conversation compacted',
            level: 'info',
            timestamp: Date.now(),
          })
        } else if (message.subtype === 'api_retry') {
          emit({
            type: 'status',
            message: 'API retry in progress',
            level: 'warning',
            timestamp: Date.now(),
          })
        } else if (typeof message.content === 'string' && message.content.trim()) {
          emit({
            type: 'status',
            message: message.content,
            level: 'info',
            timestamp: Date.now(),
          })
        }
        return
      case 'assistant_error':
        emit({
          type: 'error',
          message: message.message || 'Assistant error',
          code: 'ASSISTANT_ERROR',
          timestamp: Date.now(),
        })
        return
      case 'assistant_partial':
        if (message.delta?.trim()) {
          emit({
            type: 'message_delta',
            role: 'assistant',
            delta: message.delta,
            timestamp: Date.now(),
          })
        }
        return
      case 'tool_progress':
        emit({
          type: 'status',
          message: 'Tool running...',
          level: 'info',
          timestamp: Date.now(),
        })
        return
      case 'permission_denial':
        emit({
          type: 'status',
          message: `Tool denied: ${message.toolName ?? 'unknown'}`,
          level: 'warning',
          timestamp: Date.now(),
        })
        return
      case 'result':
        this.emitResult(turn, message, emit)
        return
      default:
        return
    }
  }

  private emitResult(
    turn: ActiveTurnState,
    message: SDKResultMessage,
    emit: (event: HeadlessHarnessEvent) => void,
  ): void {
    if (message.subtype !== 'success') {
      emit({
        type: 'error',
        message: message.errors.join('\n') || 'Turn failed',
        code: message.subtype,
        timestamp: Date.now(),
      })
      this.emitCompletion(
        turn,
        {
          type: 'completion',
          status: turn.interrupted ? 'interrupted' : 'error',
          output: '',
          inputTokens: getUsageNumber(message.usage, 'input'),
          outputTokens: getUsageNumber(message.usage, 'output'),
          durationMs: message.duration_ms,
          errors: message.errors,
          timestamp: Date.now(),
        },
        emit,
      )
      return
    }

    this.emitCompletion(
      turn,
      {
        type: 'completion',
        status: 'success',
        output: message.result ?? '',
        inputTokens: getUsageNumber(message.usage, 'input'),
        outputTokens: getUsageNumber(message.usage, 'output'),
        durationMs: message.duration_ms,
        timestamp: Date.now(),
      },
      emit,
    )
  }

  private emitCompletion(
    turn: ActiveTurnState,
    event: Extract<HeadlessHarnessEvent, { type: 'completion' }>,
    emit: (event: HeadlessHarnessEvent) => void,
  ): void {
    if (turn.completionEmitted) {
      return
    }
    turn.completionEmitted = true
    emit(event)
  }

  private createPermissionHandler({
    turn,
    permissionMode,
    emit,
  }: PermissionHandlerOptions): NonNullable<QueryEngineConfig['canUseTool']> {
    return async (tool, toolInput, _context, _assistantMessage, toolUseID) => {
      if (toolUseID) {
        turn.toolNameByUseId.set(toolUseID, tool.name)
        if (!turn.toolUseIdsEmitted.has(toolUseID)) {
          turn.toolUseIdsEmitted.add(toolUseID)
          emit({
            type: 'tool_use',
            tool: tool.name,
            input: isRecord(toolInput) ? toolInput : {},
            toolUseId: toolUseID,
            timestamp: Date.now(),
          })
        }
      }

      if (permissionMode === 'allow') {
        return { behavior: 'allow' as const }
      }

      if (permissionMode === 'deny') {
        return {
          behavior: 'deny' as const,
          reason: 'Denied by headless harness permission policy',
        }
      }

      const requestId = randomUUID()
      emit({
        type: 'permission_request',
        requestId,
        tool: tool.name,
        toolUseId: toolUseID,
        input: isRecord(toolInput) ? toolInput : {},
        question: `Approve ${tool.name}?`,
        timestamp: Date.now(),
      })

      const decision = await new Promise<HeadlessHarnessPermissionDecision>(
        resolve => {
          turn.pendingPermissions.set(requestId, {
            requestId,
            resolve,
          })
        },
      )

      return decision.behavior === 'allow'
        ? { behavior: 'allow' as const }
        : {
            behavior: 'deny' as const,
            reason: decision.reason ?? 'Denied by headless harness permission response',
          }
    }
  }
}

export function createHeadlessSessionHarness(
  options: HeadlessSessionHarnessOptions = {},
): HeadlessSessionHarness {
  return new HeadlessSessionHarness(options)
}

export function createHeadlessHarnessFileCache(): FileStateCache {
  return new FileStateCache(READ_FILE_STATE_CACHE_SIZE, 25 * 1024 * 1024)
}
