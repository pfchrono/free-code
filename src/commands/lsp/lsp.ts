import { getAllLspServers } from '../../services/lsp/config.js'
import {
  getInitializationStatus,
  getLspServerManager,
  reinitializeLspServerManager,
  waitForInitialization,
} from '../../services/lsp/manager.js'
import type { LocalCommandCall } from '../../types/command.js'
import { errorMessage } from '../../utils/errors.js'
import { getMatchingLspPlugins } from '../../utils/plugins/lspRecommendation.js'

type LspServerConfigLike = {
  command?: string
  args?: string[]
  extensionToLanguage?: Record<string, string>
}

type LspServerInstanceLike = {
  state?: string
  lastError?: Error
  config?: LspServerConfigLike
}

function usage(): string {
  return [
    'LSP code intelligence',
    '',
    'Usage:',
    '  /lsp status',
    '  /lsp recommend <path>',
    '  /lsp restart',
  ].join('\n')
}

function formatServer(name: string, server: LspServerInstanceLike): string {
  const state = server.state ?? 'unknown'
  const command = server.config?.command ?? 'unknown command'
  const args = server.config?.args?.join(' ') ?? ''
  const error = server.lastError ? ` (${errorMessage(server.lastError)})` : ''
  return `- ${name}: ${state} - ${command}${args ? ` ${args}` : ''}${error}`
}

async function renderStatus(): Promise<string> {
  await waitForInitialization()
  const init = getInitializationStatus()
  const configured = await getAllLspServers()
  const manager = getLspServerManager()
  const running = manager?.getAllServers() as
    | Map<string, LspServerInstanceLike>
    | undefined

  const lines = [
    'LSP status',
    `Initialization: ${init.status}${init.status === 'failed' ? ` (${errorMessage(init.error)})` : ''}`,
    `Configured servers: ${Object.keys(configured.servers).length}`,
    `Running servers: ${running?.size ?? 0}`,
  ]

  if (running && running.size > 0) {
    lines.push('', 'Servers:')
    for (const [name, server] of running) {
      lines.push(formatServer(name, server))
    }
  }

  return lines.join('\n')
}

async function renderRecommendations(pathspec: string): Promise<string> {
  const targetPath = pathspec.trim()
  if (!targetPath) {
    return usage()
  }

  const matches = await getMatchingLspPlugins(targetPath)
  if (matches.length === 0) {
    return `No LSP plugin recommendations found for ${targetPath}.`
  }

  return [
    `LSP plugin recommendations for ${targetPath}:`,
    '',
    ...matches.map(
      match =>
        `- ${match.pluginId}: ${match.pluginName} (${match.marketplaceName}) - ${match.command}`,
    ),
  ].join('\n')
}

async function restartLsp(): Promise<string> {
  await reinitializeLspServerManager()
  await waitForInitialization()
  return renderStatus()
}

export const call: LocalCommandCall = async args => {
  const [command = '', ...rest] = args.trim().split(/\s+/)
  const pathspec = rest.join(' ')

  switch (command.toLowerCase()) {
    case '':
    case 'help':
      return { type: 'text', value: usage() }
    case 'status':
      return { type: 'text', value: await renderStatus() }
    case 'recommend':
      return { type: 'text', value: await renderRecommendations(pathspec) }
    case 'restart':
      return { type: 'text', value: await restartLsp() }
    default:
      return { type: 'text', value: usage() }
  }
}
