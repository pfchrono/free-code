import { execFileNoThrowWithCwd } from '../../utils/execFileNoThrow.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import type { ToolUseContext } from '../../Tool.js'
import { addMcpConfig, getMcpConfigByName } from '../../services/mcp/config.js'
import type { ConfigScope, ScopedMcpServerConfig } from '../../services/mcp/types.js'
import { describeMcpConfigFilePath, ensureConfigScope } from '../../services/mcp/utils.js'
import { errorMessage } from '../../utils/errors.js'

const SERVER_NAME = 'guild'
const INSTALL_URL = 'https://github.com/mathomhaus/guild'
const INSTALL_COMMAND = 'brew install mathomhaus/tap/guild'

function usage(): string {
  return [
    'Guild shared memory and quest board',
    '',
    'Usage:',
    '  /guild status',
    '  /guild install [local|user|project]',
    '  /guild start',
    '',
    'Requires guild binary. Install: ' + INSTALL_COMMAND,
  ].join('\n')
}

async function findGuildBinary(): Promise<string | null> {
  const result = await execFileNoThrowWithCwd('sh', ['-lc', 'command -v guild'], {
    cwd: undefined,
    timeout: 2000,
    preserveOutputOnError: false,
  })
  const bin = result.stdout.trim()
  return result.code === 0 && bin ? bin : null
}

function guildMcpConfig(bin: string, scope: ConfigScope): ScopedMcpServerConfig {
  return {
    type: 'stdio',
    command: bin,
    args: ['mcp', 'serve'],
    scope,
  }
}

function formatConfigured(config: ScopedMcpServerConfig | null): string {
  if (!config) {
    return 'Configured: no'
  }
  if (config.type === 'stdio' || config.type === undefined) {
    return `Configured: yes (${config.scope}) - ${config.command} ${(config.args ?? []).join(' ')}`
  }
  return `Configured: yes (${config.scope})`
}

function isConnected(context: ToolUseContext & LocalJSXCommandContext): boolean {
  return context.options.mcpClients.some(
    client => client.name === SERVER_NAME && client.type === 'connected',
  )
}

function connectDynamic(
  context: ToolUseContext & LocalJSXCommandContext,
  bin: string,
): boolean {
  if (!context.onChangeDynamicMcpConfig) {
    return false
  }
  context.onChangeDynamicMcpConfig({
    ...(context.options.dynamicMcpConfig || {}),
    [SERVER_NAME]: guildMcpConfig(bin, 'dynamic'),
  })
  return true
}

async function status(
  context: ToolUseContext & LocalJSXCommandContext,
): Promise<string> {
  const bin = await findGuildBinary()
  const config = getMcpConfigByName(SERVER_NAME)
  return [
    'Guild status',
    `Binary: ${bin ?? 'not found'}`,
    formatConfigured(config),
    `Connected: ${isConnected(context) ? 'yes' : 'no'}`,
    '',
    bin ? 'Install/connect: /guild install' : `Install: ${INSTALL_COMMAND}`,
    `Docs: ${INSTALL_URL}`,
  ].join('\n')
}

async function install(
  context: ToolUseContext & LocalJSXCommandContext,
  scopeArg: string,
): Promise<string> {
  const bin = await findGuildBinary()
  if (!bin) {
    return [
      'Guild binary not found.',
      '',
      `Install: ${INSTALL_COMMAND}`,
      `Or see: ${INSTALL_URL}`,
      'Then run: /guild install',
    ].join('\n')
  }

  const scope = ensureConfigScope(scopeArg || 'local')
  if (
    scope === 'dynamic' ||
    scope === 'enterprise' ||
    scope === 'claudeai' ||
    scope === 'managed'
  ) {
    return 'Use scope local, user, or project.'
  }

  const existing = getMcpConfigByName(SERVER_NAME)
  const connectedNow = connectDynamic(context, bin)

  if (!existing) {
    await addMcpConfig(SERVER_NAME, guildMcpConfig(bin, scope), scope)
  }

  return [
    existing
      ? `Guild MCP already configured in ${existing.scope} scope.`
      : `Guild MCP added to ${scope} config.`,
    connectedNow
      ? 'Connecting in this session now.'
      : 'Restart Free-Code to connect.',
    '',
    `Config: ${existing ? describeMcpConfigFilePath(existing.scope) : describeMcpConfigFilePath(scope)}`,
    'Start: /guild start',
  ].join('\n')
}

function start(): string {
  return [
    'Start Guild session by asking:',
    '',
    'Start a guild session for this project. Use guild_session_start, then summarize oath, latest brief, and top quest before choosing work.',
  ].join('\n')
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const [command = 'status', ...rest] = args.trim().split(/\s+/).filter(Boolean)

  try {
    switch (command.toLowerCase()) {
      case 'help':
        onDone(usage(), { display: 'system' })
        return null
      case 'status':
        onDone(await status(context), { display: 'system' })
        return null
      case 'install':
      case 'setup':
      case 'connect':
        onDone(await install(context, rest[0] ?? ''), { display: 'system' })
        return null
      case 'start':
        onDone(start(), {
          display: 'system',
          nextInput:
            'Start a guild session for this project. Use guild_session_start, then summarize oath, latest brief, and top quest before choosing work.',
        })
        return null
      default:
        onDone(usage(), { display: 'system' })
        return null
    }
  } catch (error) {
    onDone(`Guild command failed: ${errorMessage(error)}`, { display: 'system' })
    return null
  }
}
