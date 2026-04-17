import { appendFile, readFile, writeFile } from 'fs/promises'
import { ask } from '../../QueryEngine.js'
import {
  createTaskStateBase,
  generateTaskId,
  type SetAppState,
} from '../../Task.js'
import { getSessionId } from '../../bootstrap/state.js'
import type { SDKMessage } from '../../entrypoints/agentSdkTypes.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import type { AppState } from '../../state/AppStateStore.js'
import type { LocalWorkflowTaskState } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import type { Tools } from '../../Tool.js'
import {
  cloneFileStateCache,
  type FileStateCache,
} from '../fileStateCache.js'
import { enqueuePendingNotification } from '../messageQueueManager.js'
import { registerTask, updateTaskState } from '../task/framework.js'
import {
  createUltraplanRunPaths,
  writeUltraplanRequest,
  writeUltraplanStatus,
  writeUltraplanSummary,
  type UltraplanRunPaths,
} from './artifacts.js'
import {
  buildUltraplanSystemPrompt,
  buildUltraplanUserPrompt,
} from './plannerPrompt.js'
import {
  getUltraplanProfileConfig,
  type UltraplanProfile,
} from './profile.js'
import {
  buildWorkspaceSnapshotMarkdown,
  collectWorkspaceSnapshot,
} from './workspaceSnapshot.js'

const ULTRAPLAN_ALLOWED_TOOLS = new Set(['Read', 'Glob', 'Grep'])
const ULTRAPLAN_EXPANDED_LOCAL_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'Bash',
  'PowerShell',
  'WebFetch',
  'WebSearch',
  'LSP',
  'ListMcpResources',
  'ReadMcpResource',
])
const ultraplanControllers = new Map<string, AbortController>()

export async function startLocalUltraplan(opts: {
  topic: string
  profile?: UltraplanProfile
  seedPlan?: string
  tools: Tools
  mcpClients: MCPServerConnection[]
  canUseTool?: CanUseToolFn
  readFileState: FileStateCache
  userSpecifiedModel?: string | null
  getAppState: () => AppState
  setAppState: SetAppState
  onSessionReady?: (message: string) => void
}): Promise<string> {
  const {
    topic,
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
  } = opts
  const paths = await createUltraplanRunPaths()
  const taskId = createUltraplanTask(setAppState, topic, paths.dir)
  const profileConfig = getUltraplanProfileConfig(profile)
  const plannerTools = tools.filter(tool =>
    isUltraplanPlanningTool(tool.name, profileConfig.toolMode),
  )

  await writeUltraplanRequest(paths, {
    id: paths.id,
    topic,
    cwd: process.cwd(),
    createdAt: Date.now(),
    profile,
    sourceSessionId: getSessionId(),
    ...(seedPlan ? { seedPlan } : {}),
  })
  await writeUltraplanStatus(paths, 'launching', 'Preparing local planner')

  const workspaceSnapshot = await collectWorkspaceSnapshot(process.cwd())
  const workspaceSnapshotMarkdown =
    buildWorkspaceSnapshotMarkdown(workspaceSnapshot)
  const systemPrompt = buildUltraplanSystemPrompt(
    profile,
    Boolean(seedPlan?.trim()),
  )
  const userPrompt = buildUltraplanUserPrompt(
    topic,
    workspaceSnapshotMarkdown,
    profile,
    seedPlan,
  )

  await writeFile(
    paths.workspaceSnapshotJsonPath,
    JSON.stringify(workspaceSnapshot, null, 2),
    'utf8',
  )
  await writeFile(paths.workspaceSnapshotPath, workspaceSnapshotMarkdown, 'utf8')
  await writeFile(paths.systemPromptPath, systemPrompt, 'utf8')
  await writeFile(paths.promptPath, userPrompt, 'utf8')
  await writePlannerScript(paths, profile, userSpecifiedModel)
  await writeUltraplanSummary(paths, {
    startedAt: Date.now(),
    launcher: 'in_process',
    commandPreview: `ask(read-only ultraplan --${profile})`,
  })

  if (plannerTools.length === 0) {
    const error =
      'No read-only planner tools available (expected Read, Glob, Grep).'
    await writeUltraplanStatus(paths, 'failed', error)
    await writeUltraplanSummary(paths, {
      startedAt: Date.now(),
      completedAt: Date.now(),
      launcher: 'in_process',
      error,
    })
    markUltraplanTask(taskId, setAppState, 'failed', error)
    return `ultraplan: failed to start.\nRun dir: ${paths.dir}\nReason: ${error}`
  }

  const abortController = new AbortController()
  ultraplanControllers.set(taskId, abortController)

  setAppState(prev => ({
    ...prev,
    ultraplanSessionUrl: `local:${paths.dir}`,
    ultraplanLaunching: undefined,
  }))
  markUltraplanTask(taskId, setAppState, 'running', 'Planner started in-process')
  onSessionReady?.(
    `Ultraplan (${profileConfig.name}) started in-process.\nRun dir: ${paths.dir}`,
  )

  void runLocalUltraplan({
    taskId,
    paths,
    profile,
    plannerTools,
    mcpClients,
    canUseTool,
    readFileState,
    userSpecifiedModel,
    getAppState,
    setAppState,
    abortController,
  })

  return `ultraplan\nStarting ${profileConfig.name} local planner in background...`
}

export async function stopLocalUltraplan(
  taskId: string,
  runDirOrLocalRef: string,
  setAppState: SetAppState,
): Promise<void> {
  const controller = ultraplanControllers.get(taskId)
  controller?.abort()
  ultraplanControllers.delete(taskId)

  const runDir = runDirOrLocalRef.startsWith('local:')
    ? runDirOrLocalRef.slice('local:'.length)
    : runDirOrLocalRef
  const paths = materializeRunPaths(runDir)
  await writeUltraplanStatus(paths, 'stopped', 'Stopped from the main session')
  await writeUltraplanSummary(paths, {
    completedAt: Date.now(),
    launcher: 'in_process',
    error: 'Stopped from the main session',
  })
  markUltraplanTask(taskId, setAppState, 'killed', 'Stopped')
  setAppState(prev => ({
    ...prev,
    ultraplanSessionUrl: undefined,
    ultraplanPendingChoice: undefined,
    ultraplanLaunching: undefined,
  }))
  enqueuePendingNotification({
    value: `Ultraplan stopped.\nRun dir: ${runDir}`,
    mode: 'task-notification',
  })
}

function createUltraplanTask(
  setAppState: SetAppState,
  topic: string,
  runDir: string,
): string {
  const taskId = generateTaskId('local_workflow')
  const task: LocalWorkflowTaskState = {
    ...createTaskStateBase(taskId, 'local_workflow', `Ultraplan: ${topic}`),
    type: 'local_workflow',
    status: 'running',
    workflowName: 'ultraplan',
    summary: `Planning in ${runDir}`,
    agentCount: 1,
    agents: [{ id: 'planner', name: 'planner', status: 'running' }],
    isBackgrounded: true,
  }
  registerTask(task, setAppState)
  return taskId
}

function markUltraplanTask(
  taskId: string,
  setAppState: SetAppState,
  status: LocalWorkflowTaskState['status'],
  summary?: string,
): void {
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => ({
    ...task,
    status,
    summary: summary ?? task.summary,
    endTime:
      status === 'running' || status === 'pending' ? task.endTime : Date.now(),
    agents: (task.agents ?? []).map(agent => ({
      ...agent,
      status:
        status === 'completed'
          ? 'completed'
          : status === 'failed'
            ? 'failed'
            : status === 'killed'
              ? 'skipped'
              : 'running',
    })),
  }))
}

async function runLocalUltraplan(opts: {
  taskId: string
  paths: UltraplanRunPaths
  profile: UltraplanProfile
  plannerTools: Tools
  mcpClients: MCPServerConnection[]
  canUseTool?: CanUseToolFn
  readFileState: FileStateCache
  userSpecifiedModel?: string | null
  getAppState: () => AppState
  setAppState: SetAppState
  abortController: AbortController
}): Promise<void> {
  const {
    taskId,
    paths,
    profile,
    plannerTools,
    mcpClients,
    canUseTool,
    readFileState,
    userSpecifiedModel,
    getAppState,
    setAppState,
    abortController,
  } = opts
  const profileConfig = getUltraplanProfileConfig(profile)
  let plannerReadFileCache = cloneFileStateCache(readFileState)
  let plan = ''
  let startedAt = Date.now()
  let lastSummary = 'Planner reading repo'
  let finalResult: Extract<SDKMessage, { type: 'result' }> | undefined

  try {
    const prompt = await readFile(paths.promptPath, 'utf8')
    const systemPrompt = await readFile(paths.systemPromptPath, 'utf8')

    await writeUltraplanStatus(
      paths,
      'running',
      `Planner is reading the repo (${profileConfig.name})`,
    )
    markUltraplanTask(taskId, setAppState, 'running', lastSummary)
    await appendStdoutLine(paths, `phase: reading repo (${profileConfig.name})`)

    for await (const message of ask({
      commands: [],
      prompt,
      cwd: process.cwd(),
      tools: plannerTools,
      mcpClients,
      maxTurns: profileConfig.maxTurns,
      canUseTool: canUseTool
        ? wrapUltraplanCanUseTool(canUseTool, profileConfig.toolMode)
        : allowUltraplanToolUse,
      getReadFileCache: () => plannerReadFileCache,
      setReadFileCache: cache => {
        plannerReadFileCache = cache
      },
      appendSystemPrompt: systemPrompt,
      ...(userSpecifiedModel ? { userSpecifiedModel } : {}),
      getAppState,
      setAppState,
      abortController,
    })) {
      const progressLine = formatPlannerProgress(message)
      if (progressLine) {
        lastSummary = progressLine.summary
        markUltraplanTask(taskId, setAppState, 'running', lastSummary)
        await writeUltraplanStatus(paths, 'running', progressLine.status)
        await appendStdoutLine(paths, progressLine.logLine)
      }

      if (message.type === 'result') {
        finalResult = message
      }

      const text = getMessageText(message)
      if (!text) {
        continue
      }
      plan += text
      await appendFile(paths.stdoutPath, text, 'utf8')
    }

    if (finalResult && finalResult.subtype !== 'success') {
      const reason =
        finalResult.errors?.[0] ??
        `Planner finished with ${finalResult.subtype}`
      throw new Error(reason)
    }

    const trimmedPlan =
      plan.trim() ||
      (finalResult?.subtype === 'success' ? finalResult.result.trim() : '')
    if (!trimmedPlan) {
      throw new Error('Planner exited without producing a plan')
    }

    await writeFile(paths.planPath, trimmedPlan, 'utf8')
    await writeUltraplanStatus(
      paths,
      'completed',
      `Plan completed (${profileConfig.name})`,
    )
    await writeUltraplanSummary(paths, {
      startedAt,
      completedAt: Date.now(),
      launcher: 'in_process',
      commandPreview: `ask(read-only ultraplan --${profile})`,
    })
    markUltraplanTask(taskId, setAppState, 'running', 'Plan ready for review')
    setAppState(prev => ({
      ...prev,
      ultraplanPendingChoice: {
        plan: trimmedPlan,
        sessionId: paths.dir,
        taskId,
      },
    }))
    enqueuePendingNotification({
      value: `Ultraplan plan is ready.\nRun dir: ${paths.dir}`,
      mode: 'task-notification',
    })
  } catch (error) {
    const aborted = abortController.signal.aborted
    const errorMessage =
      error instanceof Error ? error.stack ?? error.message : String(error)
    const summaryMessage = aborted ? 'Stopped' : firstLine(errorMessage)

    await appendFile(paths.stderrPath, errorMessage + '\n', 'utf8').catch(
      () => {},
    )
    await writeUltraplanStatus(
      paths,
      aborted ? 'stopped' : 'failed',
      summaryMessage,
    )
    await writeUltraplanSummary(paths, {
      startedAt,
      completedAt: Date.now(),
      launcher: 'in_process',
      error: summaryMessage,
    })
    markUltraplanTask(
      taskId,
      setAppState,
      aborted ? 'killed' : 'failed',
      summaryMessage,
    )
    setAppState(prev => ({
      ...prev,
      ultraplanSessionUrl:
        prev.ultraplanSessionUrl === `local:${paths.dir}`
          ? undefined
          : prev.ultraplanSessionUrl,
    }))
    enqueuePendingNotification({
      value: `Ultraplan ${aborted ? 'stopped' : 'failed'}: ${summaryMessage}\nRun dir: ${paths.dir}`,
      mode: 'task-notification',
    })
  } finally {
    ultraplanControllers.delete(taskId)
  }
}

async function writePlannerScript(
  paths: UltraplanRunPaths,
  profile: UltraplanProfile,
  userSpecifiedModel?: string | null,
): Promise<void> {
  const profileConfig = getUltraplanProfileConfig(profile)
  const toolList =
    profileConfig.toolMode === 'core'
      ? 'Read, Glob, Grep'
      : 'Read, Glob, Grep, LS, Bash, PowerShell, WebFetch, WebSearch, LSP, MCP (ToolSearch disabled)'
  await writeFile(
    paths.scriptPath,
    [
      '# ultraplan launch note',
      'mode: in_process',
      `profile: ${profileConfig.name}`,
      `maxTurns: ${profileConfig.maxTurns}`,
      `maxToolRounds: ${profileConfig.maxToolRounds}`,
      `model: ${userSpecifiedModel || process.env.ANTHROPIC_MODEL || 'default'}`,
      `tools: ${toolList}`,
      'launcher: QueryEngine.ask()',
    ].join('\n'),
    'utf8',
  )
}

function materializeRunPaths(dir: string): UltraplanRunPaths {
  return {
    id: dir.split(/[\\/]/).at(-1) ?? 'unknown',
    dir,
    requestPath: `${dir}/request.json`,
    statusPath: `${dir}/status.json`,
    summaryPath: `${dir}/summary.json`,
    workspaceSnapshotPath: `${dir}/workspace-snapshot.md`,
    workspaceSnapshotJsonPath: `${dir}/workspace-snapshot.json`,
    planPath: `${dir}/plan.md`,
    promptPath: `${dir}/prompt.txt`,
    systemPromptPath: `${dir}/system-prompt.txt`,
    scriptPath: `${dir}/${process.platform === 'win32' ? 'run.ps1' : 'run.sh'}`,
    stdoutPath: `${dir}/stdout.log`,
    stderrPath: `${dir}/stderr.log`,
  }
}

function wrapUltraplanCanUseTool(
  baseCanUseTool: CanUseToolFn,
  toolMode: 'core' | 'expanded' = 'expanded',
): CanUseToolFn {
  return async (tool, input, toolUseContext, assistantMessage, toolUseID) => {
    if (!isUltraplanPlanningTool(tool.name, toolMode)) {
      return {
        behavior: 'deny',
        message: `Ultraplan only allows read-only tools. Blocked: ${tool.name}`,
        decisionReason: {
          type: 'other',
          reason: `Ultraplan blocked tool ${tool.name}`,
        },
        toolUseID,
      }
    }
    const forcedDecision = tool.name.startsWith('mcp__')
      ? undefined
      : {
          behavior: 'allow' as const,
          updatedInput: input,
        }
    return baseCanUseTool(
      tool,
      input,
      toolUseContext,
      assistantMessage,
      toolUseID,
      forcedDecision,
    )
  }
}

const allowUltraplanToolUse: CanUseToolFn = async (
  tool,
  input,
  _toolUseContext,
  _assistantMessage,
  toolUseID,
) => {
  if (!isUltraplanPlanningTool(tool.name, 'expanded')) {
    return {
      behavior: 'deny',
      message: `Ultraplan only allows read-only tools. Blocked: ${tool.name}`,
      decisionReason: {
        type: 'other',
        reason: `Ultraplan blocked tool ${tool.name}`,
      },
      toolUseID,
    }
  }
  return {
    behavior: 'allow',
    updatedInput: input,
  }
}

function isUltraplanPlanningTool(
  toolName: string,
  toolMode: 'core' | 'expanded' = 'expanded',
): boolean {
  if (toolMode === 'core') {
    return ULTRAPLAN_ALLOWED_TOOLS.has(toolName)
  }
  return ULTRAPLAN_EXPANDED_LOCAL_TOOLS.has(toolName) || toolName.startsWith('mcp__')
}

function getMessageText(message: SDKMessage): string {
  if (message.type === 'assistant') {
    const blocks = Array.isArray(message.message.content)
      ? message.message.content
      : []
    return blocks
      .filter(
        (block): block is { type: 'text'; text: string } =>
          block.type === 'text' && typeof block.text === 'string',
      )
      .map(block => block.text)
      .join('')
  }

  if (message.type === 'assistant_partial') {
    return typeof message.delta === 'string' ? message.delta : ''
  }

  if (message.type === 'result' && message.subtype === 'success') {
    return typeof message.result === 'string' ? message.result : ''
  }

  return ''
}

async function appendStdoutLine(
  paths: Pick<UltraplanRunPaths, 'stdoutPath'>,
  line: string,
): Promise<void> {
  await appendFile(paths.stdoutPath, `[${new Date().toISOString()}] ${line}\n`, 'utf8')
}

function formatPlannerProgress(message: SDKMessage): {
  summary: string
  status: string
  logLine: string
} | null {
  switch (message.type) {
    case 'tool_progress': {
      const toolName = stringifyProgressField(message.data?.toolName)
      const path = stringifyProgressField(
        message.data?.file_path ?? message.data?.path,
      )
      const detail = [toolName, path].filter(Boolean).join(' ')
      return {
        summary: truncateSummary(`Inspecting ${detail || 'repo'}`),
        status: `Planner inspecting ${detail || 'repo'}`,
        logLine: `tool_progress: ${detail || safeJson(message.data)}`,
      }
    }
    case 'system': {
      if (!message.content?.trim()) {
        return null
      }
      const content = oneLine(message.content)
      return {
        summary: truncateSummary(content),
        status: content,
        logLine: `system: ${content}`,
      }
    }
    case 'assistant_error': {
      const content = oneLine(message.message || 'assistant_error')
      return {
        summary: truncateSummary(`Planner error: ${content}`),
        status: `Planner error: ${content}`,
        logLine: `assistant_error: ${content}`,
      }
    }
    case 'result': {
      if (message.subtype === 'success') {
        const detail = oneLine(message.result || 'planner completed')
        return {
          summary: truncateSummary('Planner completed'),
          status: 'Planner completed',
          logLine: `result: success ${detail.slice(0, 160)}`,
        }
      }
      const detail = oneLine(message.errors?.[0] || message.subtype)
      return {
        summary: truncateSummary(`Planner failed: ${detail}`),
        status: `Planner failed: ${detail}`,
        logLine: `result: ${message.subtype} ${detail}`,
      }
    }
    default:
      return null
  }
}

function stringifyProgressField(value: unknown): string {
  return typeof value === 'string' && value.trim() ? oneLine(value) : ''
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateSummary(value: string): string {
  return value.length > 120 ? value.slice(0, 117) + '...' : value
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0] ?? value
}
