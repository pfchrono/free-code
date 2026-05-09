import { encodeGuiEvent } from './protocolCodec.js'

export interface SessionStartEvent {
  type: 'session_start'
  version: string
  model: string
  provider: string
  timestamp: number
  cwd: string
}

export interface MessageEvent {
  type: 'message'
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ToolUseEvent {
  type: 'tool_use'
  tool: string
  input: Record<string, unknown>
  timestamp: number
}

export interface ToolResultEvent {
  type: 'tool_result'
  tool: string
  output: string
  success: boolean
  timestamp: number
}

export interface CompletionEvent {
  type: 'completion'
  outcome?: 'success' | 'error' | 'cancelled'
  outputTokens: number
  inputTokens: number
  durationMs: number
  continuationIntent?: GuiUserInputIntent
}

export interface TurnStateEvent {
  type: 'turn_state'
  state: 'idle' | 'running' | 'interrupting' | 'cancelled' | 'failed'
  timestamp: number
}

export interface ErrorEvent {
  type: 'error'
  message: string
  code?: string
}

export interface StatusEvent {
  type: 'status'
  message: string
  level: 'info' | 'warning' | 'error'
}

export interface ModelsListEvent {
  type: 'models_list'
  models: Array<{
    id: string
    name: string
    provider: string
  }>
}

export interface CommandsListEvent {
  type: 'commands_list'
  commands: Array<{
    name: string
    description: string
    aliases?: string[]
  }>
}

export type CliToGuiEvent =
  | SessionStartEvent
  | MessageEvent
  | ToolUseEvent
  | ToolResultEvent
  | CompletionEvent
  | TurnStateEvent
  | ErrorEvent
  | StatusEvent
  | ModelsListEvent
  | CommandsListEvent

export type GuiUserInputIntent = 'default' | 'continue' | 'handoff'

export interface UserInputCommand {
  type: 'user_input'
  content: string
  intent?: GuiUserInputIntent
}

export interface InterruptCommand {
  type: 'interrupt'
}

export interface SelectModelCommand {
  type: 'select_model'
  provider: string
  model: string
}

export interface GetModelsCommand {
  type: 'get_models'
}

export interface GetCommandsCommand {
  type: 'get_commands'
}

export interface HeartbeatCommand {
  type: 'heartbeat'
}

export type GuiToCliCommand =
  | UserInputCommand
  | InterruptCommand
  | SelectModelCommand
  | GetModelsCommand
  | GetCommandsCommand
  | HeartbeatCommand

export function writeGuiEvent(event: CliToGuiEvent): void {
  process.stdout.write(encodeGuiEvent(event))
}
