import { startupRawTrace } from '../utils/startupRawTrace.js'
import {
  writeGuiEvent,
  type GuiToCliCommand,
  type CliToGuiEvent,
  type MessageEvent,
} from './guiProtocol.js'
import type { Command } from '../commands.js'
import { getCommands } from '../commands.js'
import { getTools } from '../tools.js'
import { getInitialSettings } from '../utils/settings/settings.js'
import { getMainLoopModel } from '../utils/model/model.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { getOriginalCwd } from '../bootstrap/state.js'

declare const MACRO: { VERSION: string }

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

let interrupted = false
const messageHistory: Message[] = []

export async function runGuiMode(): Promise<void> {
  startupRawTrace('gui:runGuiMode started')

  writeGuiEvent({
    type: 'session_start',
    version: typeof MACRO !== 'undefined' ? MACRO.VERSION : 'dev',
    model: getMainLoopModel(),
    provider: getAPIProvider(),
    timestamp: Date.now(),
    cwd: getOriginalCwd(),
  })

  writeGuiEvent({
    type: 'status',
    message: 'GUI mode initialized',
    level: 'info',
  })

  await processCommands()
}

async function processCommands(): Promise<void> {
  startupRawTrace('gui:processCommands started')

  const state = { reading: true }

  const readLoop = async (): Promise<void> => {
    while (state.reading) {
      const command = await readNextCommand(() => { state.reading = false })
      if (command === null) {
        break
      }
      await handleCommand(command)
    }
  }

  await readLoop()

  writeGuiEvent({
    type: 'status',
    message: 'GUI session ended',
    level: 'info',
  })
}

async function readNextCommand(stopReading: () => void): Promise<GuiToCliCommand | null> {
  return new Promise((resolve) => {
    let data = ''

    const handleData = (chunk: string): void => {
      data += chunk
      const lines = data.split('\n')
      data = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          try {
            const cmd = JSON.parse(line) as GuiToCliCommand
            cleanup()
            resolve(cmd)
            return
          } catch {
            resolve(null)
            return
          }
        }
      }
    }

    const handleEnd = (): void => {
      cleanup()
      resolve(null)
    }

    const cleanup = (): void => {
      stopReading()
      process.stdin.removeListener('data', handleData)
      process.stdin.removeListener('end', handleEnd)
    }

    process.stdin.on('data', handleData)
    process.stdin.on('end', handleEnd)
  })
}

async function handleCommand(command: GuiToCliCommand): Promise<void> {
  startupRawTrace('gui:handleCommand type=' + command.type)

  try {
    switch (command.type) {
      case 'user_input':
        await handleUserInput(command.content)
        break

      case 'interrupt':
        interrupted = true
        writeGuiEvent({
          type: 'status',
          message: 'Interrupted',
          level: 'info',
        })
        break

      case 'select_model':
        writeGuiEvent({
          type: 'status',
          message: `Model selection not yet implemented: ${command.provider}/${command.model}`,
          level: 'warning',
        })
        break

      case 'get_models':
        handleGetModels()
        break

    case 'get_commands':
      await handleGetCommands()
      break

      case 'heartbeat':
        writeGuiEvent({
          type: 'status',
          message: 'ok',
          level: 'info',
        })
        break

      default:
        writeGuiEvent({
          type: 'error',
          message: `Unknown command type`,
          code: 'UNKNOWN_COMMAND',
        })
    }
  } catch (err) {
    writeGuiEvent({
      type: 'error',
      message: `Error handling command: ${err instanceof Error ? err.message : String(err)}`,
      code: 'HANDLER_ERROR',
    })
  }
}

async function handleUserInput(content: string): Promise<void> {
  const timestamp = Date.now()

  // Add to history
  messageHistory.push({ role: 'user', content, timestamp })

  writeGuiEvent({
    type: 'message',
    role: 'user',
    content,
    timestamp,
  })

  writeGuiEvent({
    type: 'status',
    message: 'Processing...',
    level: 'info',
  })

  // Check if this is a slash command
  if (content.startsWith('/')) {
    await handleSlashCommand(content)
    return
  }

  const startTime = Date.now()

  // TODO: Connect to actual CLI core
  // Integration path:
  // 1. Initialize CLI with: tools, commands, models, MCP configs
  // 2. Create AsyncIterable from stdin for continuous input
  // 3. Call runHeadless() with streaming input
  // 4. Parse stream-json output, emit to GUI via writeGuiEvent()
  // 5. Tool executions arrive as events - route to GUI
  // 6. GUI can send tool results back via stdin

  // For now, simulate realistic processing
  await new Promise(resolve => setTimeout(resolve, 100))

  // Simulate a basic response with conversation context
  const historyLen = messageHistory.filter(m => m.role === 'user').length
  const lowerContent = content.toLowerCase()

  let responseContent: string
  if (lowerContent.includes('help')) {
    responseContent = `I can help with:\n- Code editing, debugging\n- Git operations\n- Running commands\n- File management\n\nType a command or question to get started.`
  } else if (lowerContent.includes('model')) {
    responseContent = `Current model: ${getMainLoopModel()}\nProvider: ${getAPIProvider()}\n\nTo change models, use: /model <name>`
  } else if (historyLen === 1) {
    responseContent = `Hello! I'm ready to help. We've had ${historyLen} exchange.\n\nThe CLI core integration (runHeadless) is stubbed - this demonstrates the event flow.`
  } else {
    responseContent = `Received: "${content}"\n\nThis is a stub response. GUI mode foundation is ready.\nReal CLI integration requires connecting to runHeadless() in src/cli/print.ts.`
  }

  const responseTimestamp = Date.now()
  messageHistory.push({ role: 'assistant', content: responseContent, timestamp: responseTimestamp })

  writeGuiEvent({
    type: 'message',
    role: 'assistant',
    content: responseContent,
    timestamp: responseTimestamp,
  })

  const durationMs = Date.now() - startTime

  writeGuiEvent({
    type: 'completion',
    outputTokens: Math.floor(responseContent.length / 4),
    inputTokens: Math.floor(content.length / 4),
    durationMs,
  })
}

async function handleSlashCommand(content: string): Promise<void> {
  const parts = content.slice(1).split(/\s+/)
  const commandName = parts[0]
  const args = parts.slice(1).join(' ')

  const commands = await getCommands(getOriginalCwd())
  const command = commands.find(cmd =>
    cmd.name === commandName ||
    (Array.isArray(cmd.aliases) && cmd.aliases.includes(commandName))
  )

  if (!command) {
    writeGuiEvent({
      type: 'error',
      message: `Unknown command: /${commandName}`,
      code: 'UNKNOWN_COMMAND',
    })
    writeGuiEvent({
      type: 'completion',
      outputTokens: 0,
      inputTokens: 0,
      durationMs: 0,
    })
    return
  }

  // TODO: Execute actual CLI command via runHeadless
  // For now, return helpful stub response
  const response = getCommandHelpResponse(command.name, command.description, args)

  writeGuiEvent({
    type: 'message',
    role: 'assistant',
    content: response,
    timestamp: Date.now(),
  })

  writeGuiEvent({
    type: 'completion',
    outputTokens: Math.floor(response.length / 4),
    inputTokens: Math.floor(content.length / 4),
    durationMs: 0,
  })
}

function getCommandHelpResponse(name: string, description: string, args: string): string {
  const helpTexts: Record<string, string> = {
    'init': 'Creates a CLAUDE.md file in your project with documentation.\n\nUsage: /init',
    'compact': 'Summarizes conversation history to save context.\n\nUsage: /compact [instructions]',
    'clear': 'Clears conversation history.\n\nUsage: /clear',
    'status': `Current status:\n- Model: ${getMainLoopModel()}\n- Provider: ${getAPIProvider()}\n- Messages: ${messageHistory.length}`,
    'cost': 'Shows token usage and cost estimates for this session.\n\nUsage: /cost',
    'review': 'Reviews a pull request.\n\nUsage: /review [pr-number]',
    'help': `Available commands: /init, /compact, /clear, /status, /cost, /review, /model\n\nType /<command> to use.`,
    'model': `Change the active model.\n\nUsage: /model <model-name>\n\nCurrent: ${getMainLoopModel()}`,
    'compact': `Summarizes conversation to save context.\n\nUsage: /compact [optional summarization instructions]`,
    'context': `Shows current context window usage.\n\nUsage: /context`,
    'undo': `Restores previous checkpoint.\n\nUsage: /undo`,
    'rewind': `Restores code and/or conversation to previous point.\n\nUsage: /rewind [checkpoint-name]`,
  }

  if (helpTexts[name]) {
    return helpTexts[name]
  }

  return `Command: /${name}\n${description || 'No description available.'}\n\nExecution via CLI core not yet implemented.`
}

function handleGetModels(): void {
  const settings = getInitialSettings()
  const currentModel = getMainLoopModel()
  const provider = getAPIProvider()

  writeGuiEvent({
    type: 'models_list',
    models: [
      {
        id: currentModel,
        name: currentModel,
        provider,
      },
    ],
  })

  void settings
}

async function handleGetCommands(): Promise<void> {
  const commands = await getCommands(getOriginalCwd())

  writeGuiEvent({
    type: 'commands_list',
    commands: commands
      .filter((cmd: Command) => cmd.type === 'prompt' || cmd.type === 'local')
      .map((cmd: Command) => ({
        name: cmd.name,
        description: cmd.description || '',
        aliases: cmd.aliases,
      })),
  })
}
