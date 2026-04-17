import type { Command } from '../commands.js'
import { DIAMOND_OPEN } from '../constants/figures.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import type { AppState } from '../state/AppStateStore.js'
import type { Tools } from '../Tool.js'
import type { LocalJSXCommandCall } from '../types/command.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import {
  parseUltraplanArgs,
  type UltraplanProfile,
} from '../utils/ultraplan/profile.js'
import {
  startLocalUltraplan,
  stopLocalUltraplan,
} from '../utils/ultraplan/localSession.js'

function buildLaunchMessage(
  profile: UltraplanProfile,
  disconnectedBridge?: boolean,
): string {
  const prefix = disconnectedBridge
    ? 'Remote control was disconnected first. '
    : ''
  return `${DIAMOND_OPEN} ultraplan\n${prefix}Starting a ${profile} local planner in background...`
}

function buildAlreadyActiveMessage(localRef: string | undefined): string {
  return localRef
    ? `ultraplan: already running. Current local run: ${localRef}`
    : 'ultraplan: already launching. Please wait for the local planner to start.'
}

export async function launchUltraplan(opts: {
  blurb: string
  profile?: UltraplanProfile
  seedPlan?: string
  tools: Tools
  mcpClients: MCPServerConnection[]
  canUseTool?: CanUseToolFn
  readFileState: FileStateCache
  userSpecifiedModel?: string | null
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  signal: AbortSignal
  disconnectedBridge?: boolean
  onSessionReady?: (msg: string) => void
}): Promise<string> {
  const {
    blurb,
    profile = 'deep',
    seedPlan,
    tools,
    mcpClients,
    canUseTool,
    readFileState,
    userSpecifiedModel,
    getAppState,
    setAppState,
    onSessionReady,
    disconnectedBridge,
  } = opts

  const { ultraplanSessionUrl: active, ultraplanLaunching } = getAppState()
  if (active || ultraplanLaunching) {
    return buildAlreadyActiveMessage(active)
  }

  if (!blurb && !seedPlan) {
    return [
      'Usage: /ultraplan [--fast|--deep|--max] <prompt>, or include "ultraplan" in your prompt.',
      '',
      'This starts an in-process planning-only workflow.',
      'The planner inspects the repo, writes a deep plan locally, and then lets',
      'you insert that plan back into the current conversation.',
      '',
      'Profiles: --fast (quick), --deep (default), --max (most thorough).',
    ].join('\n')
  }

  setAppState(prev => ({
    ...prev,
    ultraplanLaunching: true,
  }))

  void startLocalUltraplan({
    topic: blurb || 'Refine the existing plan',
    profile,
    seedPlan,
    tools,
    mcpClients,
    canUseTool,
    readFileState,
    userSpecifiedModel,
    getAppState,
    setAppState,
    onSessionReady,
  }).catch(error => {
    setAppState(prev => ({
      ...prev,
      ultraplanLaunching: undefined,
      ultraplanSessionUrl: undefined,
    }))
    console.error(error)
  })

  return buildLaunchMessage(profile, disconnectedBridge)
}

export async function stopUltraplan(
  taskId: string,
  sessionId: string,
  setAppState: (f: (prev: AppState) => AppState) => void,
): Promise<void> {
  await stopLocalUltraplan(taskId, sessionId, setAppState)
}

const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const parsed = parseUltraplanArgs(args)
  const blurb = parsed.blurb

  if (args.trim() === '--switch') {
    onDone(
      'ultraplan: `--switch` is not supported in local mode. Use `--fast`, `--deep`, or `--max` with a prompt.',
      { display: 'system' },
    )
    return null
  }

  if (!blurb) {
    const msg = await launchUltraplan({
      blurb,
      profile: parsed.profile,
      tools: context.options.tools,
      mcpClients: context.options.mcpClients,
      canUseTool: context.canUseTool,
      readFileState: context.readFileState,
      userSpecifiedModel: context.options.mainLoopModel,
      getAppState: context.getAppState,
      setAppState: context.setAppState,
      signal: context.abortController.signal,
    })
    onDone(msg, { display: 'system' })
    return null
  }

  const { ultraplanSessionUrl: active, ultraplanLaunching } =
    context.getAppState()
  if (active || ultraplanLaunching) {
    onDone(buildAlreadyActiveMessage(active), { display: 'system' })
    return null
  }

  const msg = await launchUltraplan({
    blurb,
    profile: parsed.profile,
    tools: context.options.tools,
    mcpClients: context.options.mcpClients,
    canUseTool: context.canUseTool,
    readFileState: context.readFileState,
    userSpecifiedModel: context.options.mainLoopModel,
    getAppState: context.getAppState,
    setAppState: context.setAppState,
    signal: context.abortController.signal,
  })
  onDone(msg, { display: 'system' })
  return null
}

export default {
  type: 'local-jsx',
  name: 'ultraplan',
  description:
    '~5-15 min local planning session in background that returns a plan here',
  argumentHint: '[--fast|--deep|--max] <prompt>',
  isEnabled: () => true,
  load: () => Promise.resolve({ call }),
} satisfies Command
