import { findCommand, getCommands } from '../commands.js'
import type {
  Command,
  LocalCommandResult,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../types/command.js'
import { logForDebugging } from './debug.js'
import type { FileStateCache } from './fileStateCache.js'
import { parseSlashCommand } from './slashCommandParsing.js'

export type HeadlessLocalCommandRunResult = {
  command: Command
  parsedArgs: string
  result: LocalCommandResult
}

const NO_CONTENT_MESSAGE = '(no content)'

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
  if (!command) {
    return null
  }

  logForDebugging(
    `[HeadlessLocal] Running /${parsedSlash.commandName} as ${command.type}`,
  )

  const messages = options.messages ?? []
  const commandContext = {
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
  } as const

  if (command.type === 'local') {
    if (!command.supportsNonInteractive) {
      return null
    }

    const mod = await command.load()
    const result = await mod.call(parsedSlash.args, commandContext as never)

    return {
      command,
      parsedArgs: parsedSlash.args,
      result,
    }
  }

  if (command.type !== 'local-jsx') {
    return null
  }

  logForDebugging(`[HeadlessLocal] Loading /${command.name}`)
  const mod = await command.load()
  logForDebugging(`[HeadlessLocal] Loaded /${command.name}`)
  const result = await new Promise<LocalCommandResult>((resolve, reject) => {
    let settled = false
    const onDone: LocalJSXCommandOnDone = (output, doneOptions) => {
      if (settled) {
        return
      }
      logForDebugging(`[HeadlessLocal] onDone for /${command.name}`)
      settled = true
      if (doneOptions?.display === 'skip') {
        resolve({ type: 'skip' })
        return
      }
      resolve({
        type: 'text',
        value: output ?? NO_CONTENT_MESSAGE,
      })
    }

    void mod
      .call(onDone, commandContext as never, parsedSlash.args)
      .then(jsx => {
        logForDebugging(`[HeadlessLocal] call resolved for /${command.name}`)
        if (settled) {
          return
        }
        settled = true
        resolve(
          jsx == null
            ? { type: 'skip' }
            : {
                type: 'text',
                value: NO_CONTENT_MESSAGE,
              },
        )
      })
      .catch(error => {
        if (!settled) {
          settled = true
          reject(error)
        }
      })
  })

  return {
    command,
    parsedArgs: parsedSlash.args,
    result,
  }
}
