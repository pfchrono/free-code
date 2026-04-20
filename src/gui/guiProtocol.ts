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
}

export interface TurnStateEvent {
  type: 'turn_state'
  state: 'idle' | 'running' | 'interrupting' | 'cancelled'
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

export interface UserInputCommand {
  type: 'user_input'
  content: string
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
  process.stdout.write(JSON.stringify(event) + '\n')
}

export async function readGuiCommand(): Promise<GuiToCliCommand | null> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.on('data', (chunk: string) => {
      data += chunk
      const lines = data.split('\n')
      data = lines.pop() || ''
      for (const line of lines) {
        if (line.trim()) {
          try {
            resolve(JSON.parse(line) as GuiToCliCommand)
            return
          } catch {
            resolve(null)
            return
          }
        }
      }
    })
    process.stdin.on('end', () => {
      resolve(null)
    })
  })
}
