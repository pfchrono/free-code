import {
  getCurrentResumeSource,
  getMainThreadAgentType,
  getOriginalCwd,
  getSessionId,
  isSessionPersistenceDisabled,
} from '../../bootstrap/state.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { getCurrentWorktreeSession } from '../../utils/worktree.js'
import type { LocalJSXCommandContext } from '../../types/command.js'
import type { ContextData } from '../../utils/analyzeContext.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import {
  getAutoCompactThreshold,
  isAutoCompactEnabled,
} from '../../services/compact/autoCompact.js'
import {
  getSessionMemoryCompactConfig,
  shouldUseSessionMemoryCompaction,
} from '../../services/compact/sessionMemoryCompact.js'
import { getSessionMemoryConfig } from '../../services/SessionMemory/sessionMemoryUtils.js'
import {
  loadPersistedSessionState,
  type PersistedCompactionEvent,
} from '../../utils/persistedSessionState.js'

export type StatusSectionHealth = 'ok' | 'warning' | 'unavailable'

export type StatusSnapshot = {
  session: {
    id: string
    cwd: string
    originalCwd: string
    persistence: 'enabled' | 'disabled'
    resumeSource: {
      value: 'fresh' | 'visible_history' | 'core_persisted_memory' | 'checkpointed_state'
      detail: string
    }
    health: StatusSectionHealth
    warnings: string[]
  }
  model: {
    provider: string
    model: string
    fastMode: boolean
    thinking: string
    agentType: string | null
  }
  context: {
    health: StatusSectionHealth
    usageText: string
    autoCompactText: string
    warnings: string[]
  }
  compaction: {
    health: StatusSectionHealth
    enabled: boolean
    thresholdText: string
    strategy: string
    sessionMemoryText: string
    history: PersistedCompactionEvent[]
    warnings: string[]
  }
  worktree: {
    health: StatusSectionHealth
    active: boolean
    path: string | null
    branch: string | null
    name: string | null
    warnings: string[]
  }
  mcp: {
    health: StatusSectionHealth
    total: number
    connected: number
    pending: number
    failed: number
    disabled: number
    needsAuth: number
    degraded: string[]
  }
  agentPolicy: {
    permissionMode: string
    additionalWorkingDirectories: number
    bypassPermissionsAvailable: boolean
    thinking: string
    fastMode: boolean
    activeAgents: number
    activeAgentType: string | null
  }
}

type BuildStatusSnapshotDeps = {
  collectContextDataFn?: (context: {
    messages: LocalJSXCommandContext['messages']
    getAppState: LocalJSXCommandContext['getAppState']
    options: {
      mainLoopModel: string
      tools: LocalJSXCommandContext['options']['tools']
      agentDefinitions: LocalJSXCommandContext['options']['agentDefinitions']
      customSystemPrompt?: string
      appendSystemPrompt?: string
    }
  }) => Promise<ContextData>
  loadPersistedSessionStateFn?: typeof loadPersistedSessionState
  isAutoCompactEnabledFn?: typeof isAutoCompactEnabled
  getAutoCompactThresholdFn?: typeof getAutoCompactThreshold
  shouldUseSessionMemoryCompactionFn?: typeof shouldUseSessionMemoryCompaction
}

export async function buildStatusSnapshot(
  context: LocalJSXCommandContext,
  deps: BuildStatusSnapshotDeps = {},
): Promise<StatusSnapshot> {
  const appState = context.getAppState()
  const worktreeSession = getCurrentWorktreeSession()
  const collectFn =
    deps.collectContextDataFn ??
    (await import('../context/context-noninteractive.js')).collectContextData
  const loadPersistedStateFn =
    deps.loadPersistedSessionStateFn ?? loadPersistedSessionState
  const isAutoCompactEnabledFn =
    deps.isAutoCompactEnabledFn ?? isAutoCompactEnabled
  const getAutoCompactThresholdFn =
    deps.getAutoCompactThresholdFn ?? getAutoCompactThreshold
  const shouldUseSessionMemoryCompactionFn =
    deps.shouldUseSessionMemoryCompactionFn ?? shouldUseSessionMemoryCompaction

  let contextHealth: StatusSectionHealth = 'ok'
  let contextUsageText = 'Unavailable'
  let autoCompactText = 'Unavailable'
  const contextWarnings: string[] = []

  try {
    const contextData = await collectFn({
      messages: context.messages,
      getAppState: context.getAppState,
      options: {
        mainLoopModel: context.options.mainLoopModel,
        tools: context.options.tools,
        agentDefinitions: context.options.agentDefinitions,
        customSystemPrompt: context.options.customSystemPrompt,
        appendSystemPrompt: context.options.appendSystemPrompt,
      },
    })

    const contextPercentage = Math.min(Math.max(contextData.percentage, 0), 100)
    contextUsageText =
      `${contextData.totalTokens.toLocaleString()} / ${contextData.rawMaxTokens.toLocaleString()} ` +
      `(${contextPercentage}%)`
    autoCompactText = contextData.isAutoCompactEnabled
      ? contextData.autoCompactThresholdPercent !== undefined
        ? `Enabled at ${formatPercent(contextData.autoCompactThresholdPercent)}`
        : 'Enabled'
      : 'Disabled'
  } catch (error) {
    contextHealth = 'warning'
    contextWarnings.push(
      `Context data unavailable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const mcpSummary = summarizeMcpClients(appState.mcp.clients)
  const worktreeWarnings =
    worktreeSession === null ? ['No active worktree session'] : []
  const resumeInfo = getCurrentResumeSource()
  const sessionWarnings: string[] = []
  const persistedSessionState = await loadPersistedStateFn(getSessionId())
  const effectiveThreshold = isAutoCompactEnabledFn()
    ? getAutoCompactThresholdFn(context.options.mainLoopModel)
    : undefined
  const sessionMemoryConfig = getSessionMemoryConfig()
  const sessionMemoryCompactConfig = getSessionMemoryCompactConfig()
  const compactionHistory = persistedSessionState?.compactionHistory ?? []

  let sessionHealth: StatusSectionHealth = 'ok'
  if (persistedSessionState?.resumeMetadata?.detail) {
    sessionWarnings.push(persistedSessionState.resumeMetadata.detail)
  } else if (resumeInfo.detail) {
    sessionWarnings.push(resumeInfo.detail)
  }

  let compactionHealth: StatusSectionHealth = 'ok'
  const compactionWarnings: string[] = []
  if (compactionHistory.length === 0) {
    compactionWarnings.push('No recent compaction events recorded')
    compactionHealth = 'warning'
  }

  return {
    session: {
      id: getSessionId(),
      cwd: process.cwd(),
      originalCwd: getOriginalCwd(),
      persistence: isSessionPersistenceDisabled() ? 'disabled' : 'enabled',
      resumeSource: {
        value: resumeInfo.source,
        detail:
          resumeInfo.detail ??
          persistedSessionState?.resumeMetadata?.detail ??
          'Current session state',
      },
      health: sessionHealth,
      warnings: sessionWarnings,
    },
    model: {
      provider: getAPIProvider(),
      model: context.options.mainLoopModel,
      fastMode: Boolean(appState.fastMode),
      thinking:
        appState.thinkingEnabled === undefined
          ? 'default'
          : appState.thinkingEnabled
            ? 'enabled'
            : 'disabled',
      agentType: getMainThreadAgentType() ?? appState.agent ?? null,
    },
    context: {
      health: contextHealth,
      usageText: contextUsageText,
      autoCompactText,
      warnings: contextWarnings,
    },
    compaction: {
      health: compactionHealth,
      enabled: isAutoCompactEnabledFn(),
      thresholdText:
        effectiveThreshold !== undefined
          ? `${effectiveThreshold.toLocaleString()} tok`
          : 'Disabled',
      strategy: shouldUseSessionMemoryCompactionFn()
        ? 'session_memory'
        : 'summary',
      sessionMemoryText:
        `init ${sessionMemoryConfig.minimumMessageTokensToInit.toLocaleString()} tok, ` +
        `update +${sessionMemoryConfig.minimumTokensBetweenUpdate.toLocaleString()} tok, ` +
        `${sessionMemoryConfig.toolCallsBetweenUpdates} tool calls, ` +
        `keep ${sessionMemoryCompactConfig.minTokens.toLocaleString()}-${sessionMemoryCompactConfig.maxTokens.toLocaleString()} tok`,
      history: compactionHistory,
      warnings: compactionWarnings,
    },
    worktree: {
      health: worktreeSession === null ? 'warning' : 'ok',
      active: worktreeSession !== null,
      path: worktreeSession?.worktreePath ?? null,
      branch: worktreeSession?.worktreeBranch ?? null,
      name: worktreeSession?.worktreeName ?? null,
      warnings: worktreeWarnings,
    },
    mcp: mcpSummary,
    agentPolicy: {
      permissionMode: appState.toolPermissionContext.mode,
      additionalWorkingDirectories:
        appState.toolPermissionContext.additionalWorkingDirectories.size,
      bypassPermissionsAvailable:
        appState.toolPermissionContext.isBypassPermissionsModeAvailable,
      thinking:
        appState.thinkingEnabled === undefined
          ? 'default'
          : appState.thinkingEnabled
            ? 'enabled'
            : 'disabled',
      fastMode: Boolean(appState.fastMode),
      activeAgents: appState.agentDefinitions.activeAgents.length,
      activeAgentType: getMainThreadAgentType() ?? appState.agent ?? null,
    },
  }
}

export function renderStatusSnapshot(snapshot: StatusSnapshot): string {
  const lines = ['## Status', '']

  lines.push('### Session')
  lines.push(`- Session ID: \`${snapshot.session.id}\``)
  lines.push(`- CWD: \`${snapshot.session.cwd}\``)
  lines.push(`- Original CWD: \`${snapshot.session.originalCwd}\``)
  lines.push(`- Persistence: ${snapshot.session.persistence}`)
  lines.push(
    `- Resume source: ${snapshot.session.resumeSource.value} (${snapshot.session.resumeSource.detail})`,
  )
  appendWarnings(lines, snapshot.session.warnings)
  lines.push('')

  lines.push('### Model')
  lines.push(`- Provider: ${snapshot.model.provider}`)
  lines.push(`- Model: ${snapshot.model.model}`)
  lines.push(`- Fast mode: ${snapshot.model.fastMode ? 'on' : 'off'}`)
  lines.push(`- Thinking: ${snapshot.model.thinking}`)
  if (snapshot.model.agentType) {
    lines.push(`- Agent type: ${snapshot.model.agentType}`)
  }
  lines.push('')

  lines.push('### Context')
  lines.push(`- Usage: ${snapshot.context.usageText}`)
  lines.push(`- Auto-compact: ${snapshot.context.autoCompactText}`)
  appendWarnings(lines, snapshot.context.warnings)
  lines.push('')

  lines.push('### Compaction')
  lines.push(`- Enabled: ${snapshot.compaction.enabled ? 'yes' : 'no'}`)
  lines.push(`- Threshold: ${snapshot.compaction.thresholdText}`)
  lines.push(`- Strategy: ${snapshot.compaction.strategy}`)
  lines.push(`- Session memory: ${snapshot.compaction.sessionMemoryText}`)
  if (snapshot.compaction.history.length > 0) {
    for (const event of snapshot.compaction.history) {
      lines.push(
        `- Recent: ${event.occurredAt} ${event.trigger}/${event.strategy} ` +
          `${formatCountDelta(event.beforeMessages, event.afterMessages, 'msgs')} ` +
          `${formatCountDelta(event.beforeTokens, event.afterTokens, 'tok')}`.trim(),
      )
      if (event.retainedSummary) {
        lines.push(`- Retained: ${event.retainedSummary}`)
      }
      if (event.droppedSummary) {
        lines.push(`- Dropped: ${event.droppedSummary}`)
      }
    }
  }
  appendWarnings(lines, snapshot.compaction.warnings)
  lines.push('')

  lines.push('### Worktree')
  lines.push(`- Active: ${snapshot.worktree.active ? 'yes' : 'no'}`)
  if (snapshot.worktree.path) {
    lines.push(`- Path: \`${snapshot.worktree.path}\``)
  }
  if (snapshot.worktree.branch) {
    lines.push(`- Branch: ${snapshot.worktree.branch}`)
  }
  if (snapshot.worktree.name) {
    lines.push(`- Name: ${snapshot.worktree.name}`)
  }
  appendWarnings(lines, snapshot.worktree.warnings)
  lines.push('')

  lines.push('### MCP')
  lines.push(
    `- Servers: ${snapshot.mcp.connected} connected / ${snapshot.mcp.total} total`,
  )
  lines.push(
    `- Pending: ${snapshot.mcp.pending}, Needs auth: ${snapshot.mcp.needsAuth}, Failed: ${snapshot.mcp.failed}, Disabled: ${snapshot.mcp.disabled}`,
  )
  if (snapshot.mcp.degraded.length > 0) {
    lines.push(`- Degraded: ${snapshot.mcp.degraded.join('; ')}`)
  }
  lines.push('')

  lines.push('### Agent Policy')
  lines.push(`- Permission mode: ${snapshot.agentPolicy.permissionMode}`)
  lines.push(
    `- Additional working directories: ${snapshot.agentPolicy.additionalWorkingDirectories}`,
  )
  lines.push(
    `- Bypass permissions available: ${snapshot.agentPolicy.bypassPermissionsAvailable ? 'yes' : 'no'}`,
  )
  lines.push(`- Thinking: ${snapshot.agentPolicy.thinking}`)
  lines.push(`- Fast mode: ${snapshot.agentPolicy.fastMode ? 'on' : 'off'}`)
  lines.push(`- Active agents: ${snapshot.agentPolicy.activeAgents}`)
  if (snapshot.agentPolicy.activeAgentType) {
    lines.push(`- Active agent type: ${snapshot.agentPolicy.activeAgentType}`)
  }

  return lines.join('\n')
}

function appendWarnings(lines: string[], warnings: string[]): void {
  for (const warning of warnings) {
    lines.push(`- Warning: ${warning}`)
  }
}

function formatCountDelta(
  before: number | undefined,
  after: number | undefined,
  label: string,
): string {
  if (before === undefined || after === undefined) {
    return ''
  }

  const dropped = Math.max(before - after, 0)
  return `${before}->${after} ${label} (${dropped} dropped)`
}

function formatPercent(value: number): string {
  return `${Math.min(Math.max(value, 0), 100).toFixed(0)}%`
}

function summarizeMcpClients(
  clients: MCPServerConnection[],
): StatusSnapshot['mcp'] {
  const summary = {
    health: 'ok' as StatusSectionHealth,
    total: clients.length,
    connected: 0,
    pending: 0,
    failed: 0,
    disabled: 0,
    needsAuth: 0,
    degraded: [] as string[],
  }

  for (const client of clients) {
    switch (client.type) {
      case 'connected':
        summary.connected += 1
        break
      case 'pending':
        summary.pending += 1
        summary.degraded.push(`${client.name}: pending`)
        break
      case 'failed':
        summary.failed += 1
        summary.degraded.push(
          `${client.name}: failed${client.error ? ` (${client.error})` : ''}`,
        )
        break
      case 'disabled':
        summary.disabled += 1
        summary.degraded.push(`${client.name}: disabled`)
        break
      case 'needs-auth':
        summary.needsAuth += 1
        summary.degraded.push(`${client.name}: needs auth`)
        break
    }
  }

  if (summary.degraded.length > 0) {
    summary.health = 'warning'
  }

  return summary
}
