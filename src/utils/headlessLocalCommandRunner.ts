import { findCommand, getCommands } from '../commands.js'
import type {
  Command,
  LocalCommandResult,
  LocalJSXCommandContext,
} from '../types/command.js'
import type { FileStateCache } from './fileStateCache.js'
import { parseSlashCommand } from './slashCommandParsing.js'

export type HeadlessLocalCommandRunResult = {
  command: Command
  parsedArgs: string
  result: LocalCommandResult
}

export async function runHeadlessLocalSlashCommand(
  input: string,
  options: {
    cwd: string
    appState: unknown
    setAppState: (updater: (prev: any) => any) => void
    messages?: any[]
    fileCache: FileStateCache
    commands?: Command[]
    theme?: string
    canUseTool?: LocalJSXCommandContext['canUseTool']
    abortController?: AbortController
  },
): Promise<HeadlessLocalCommandRunResult | null> {
  const parsedSlash = parseSlashCommand(input)
  if (!parsedSlash) {
    return null
  }

  const commands = options.commands ?? (await getCommands(options.cwd))
  const command = findCommand(parsedSlash.commandName, commands)
  if (
    !command ||
    command.type !== 'local' ||
    !command.supportsNonInteractive
  ) {
    return null
  }

  const mod = await command.load()
  const messages = options.messages ?? []
  const result = await mod.call(parsedSlash.args, {
    canUseTool:
      options.canUseTool ?? (async () => ({ behavior: 'allow' as const })),
    getAppState: () => options.appState,
    setAppState: options.setAppState,
    messages,
    setMessages: updater => {
      const next = updater(messages)
      messages.splice(0, messages.length, ...next)
    },
    abortController: options.abortController ?? new AbortController(),
    readFileState: options.fileCache,
    options: {
      dynamicMcpConfig: {},
      ideInstallationStatus: null,
      theme: (options.theme ?? 'dark') as never,
    },
    onChangeAPIKey: () => {},
  } as never)

  return {
    command,
    parsedArgs: parsedSlash.args,
    result,
  }
}
