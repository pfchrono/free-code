import { feature } from 'bun:bundle'
import { getShortcutDisplay } from '../keybindings/shortcutFormat.js'
import { isExtractModeActive } from '../memdir/paths.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import type { ToolUseContext } from '../Tool.js'
import type { HookProgress } from '../types/hooks.js'
import type {
  AssistantMessage,
  Message,
  RequestStartEvent,
  StopHookInfo,
  StreamEvent,
  TombstoneMessage,
  ToolUseSummaryMessage,
} from '../types/message.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import type { REPLHookContext } from '../utils/hooks/postSamplingHooks.js'
import {
  executeStopHooks,
  executeTaskCompletedHooks,
  executeTeammateIdleHooks,
  getStopHookMessage,
  getTaskCompletedHookMessage,
  getTeammateIdleHookMessage,
} from '../utils/hooks.js'
import {
  createStopHookSummaryMessage,
  createSystemMessage,
  createUserInterruptionMessage,
  createUserMessage,
} from '../utils/messages.js'
import type { SystemPrompt } from '../utils/systemPromptType.js'
import { getTaskListId, listTasks } from '../utils/tasks.js'
import { getAgentName, getTeamName, isTeammate } from '../utils/teammate.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const extractMemoriesModule = feature('EXTRACT_MEMORIES')
  ? (require('../services/extractMemories/extractMemories.js') as typeof import('../services/extractMemories/extractMemories.js'))
  : null
const jobClassifierModule = feature('TEMPLATES')
  ? (require('../jobs/classifier.js') as typeof import('../jobs/classifier.js'))
  : null

/* eslint-enable @typescript-eslint/no-require-imports */

import type { QuerySource } from '../constants/querySource.js'
import { executeAutoDream } from '../services/autoDream/autoDream.js'
import { executePromptSuggestion } from '../services/PromptSuggestion/promptSuggestion.js'
import { isBareMode, isEnvDefinedFalsy } from '../utils/envUtils.js'
import {
  createCacheSafeParams,
  saveCacheSafeParams,
} from '../utils/forkedAgent.js'

type StopHookResult = {
  blockingErrors: Message[]
  preventContinuation: boolean
  summaryMessages: Message[]
}

type StopHookSummaryTracker = {
  hookCount: number
  hookInfos: StopHookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason: string
  hasOutput: boolean
  toolUseID: string
}

function createStopHookSummaryTracker(): StopHookSummaryTracker {
  return {
    hookCount: 0,
    hookInfos: [],
    hookErrors: [],
    preventedContinuation: false,
    stopReason: '',
    hasOutput: false,
    toolUseID: '',
  }
}

function maybeAddStopHookSummaryMessage(
  tracker: StopHookSummaryTracker,
  summaryMessages: Message[],
  hookLabel: string | undefined,
  totalDurationMs: number,
) {
  if (
    tracker.hookCount === 0 &&
    tracker.hookErrors.length === 0 &&
    !tracker.preventedContinuation &&
    tracker.stopReason.length === 0
  ) {
    return
  }

  summaryMessages.push(
    createStopHookSummaryMessage(
      tracker.hookCount,
      tracker.hookInfos,
      tracker.hookErrors,
      tracker.preventedContinuation,
      tracker.stopReason || undefined,
      tracker.hasOutput,
      'suggestion',
      tracker.toolUseID,
      hookLabel,
      totalDurationMs,
    ),
  )
}

function collectStopHookTelemetryFromResult(
  result: { message?: Message } & { blockingError?: { blockingError: string } },
  tracker: StopHookSummaryTracker,
) {
  if (!result.message) {
    return
  }

  if (result.message.type === 'progress' && result.message.toolUseID) {
    tracker.hookCount += 1
    tracker.toolUseID = result.message.toolUseID
    const progressData = result.message.data as HookProgress
    if (progressData.command) {
      tracker.hookInfos.push({
        command: progressData.command,
        promptText: progressData.promptText,
      })
    }
  }

  if (result.message.type === 'attachment') {
    const attachment = result.message.attachment
    if (
      'hookEvent' in attachment &&
      (attachment.hookEvent === 'Stop' ||
        attachment.hookEvent === 'SubagentStop' ||
        attachment.hookEvent === 'TeammateIdle' ||
        attachment.hookEvent === 'TaskCompleted')
    ) {
      if (attachment.type === 'hook_non_blocking_error') {
        tracker.hookErrors.push(
          attachment.stderr || `Exit code ${attachment.exitCode}`,
        )
        tracker.hasOutput = true
      } else if (attachment.type === 'hook_error_during_execution') {
        tracker.hookErrors.push(attachment.content)
        tracker.hasOutput = true
      } else if (attachment.type === 'hook_success') {
        if (
          (attachment.stdout && attachment.stdout.trim()) ||
          (attachment.stderr && attachment.stderr.trim())
        ) {
          tracker.hasOutput = true
        }
      }

      if (
        'durationMs' in attachment &&
        'command' in attachment &&
        attachment.durationMs !== undefined
      ) {
        const info = tracker.hookInfos.find(
          i =>
            i.command === attachment.command &&
            i.durationMs === undefined,
        )
        if (info) {
          info.durationMs = attachment.durationMs
        }
      }
    }
  }
}

export async function* handleStopHooks(
  messagesForQuery: Message[],
  assistantMessages: AssistantMessage[],
  systemPrompt: SystemPrompt,
  userContext: { [k: string]: string },
  systemContext: { [k: string]: string },
  toolUseContext: ToolUseContext,
  querySource: QuerySource,
  stopHookActive?: boolean,
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  StopHookResult
> {
  const hookStartTime = Date.now()

  const stopHookContext: REPLHookContext = {
    messages: [...messagesForQuery, ...assistantMessages],
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    querySource,
  }
  // Only save params for main session queries — subagents must not overwrite.
  // Outside the prompt-suggestion gate: the REPL /btw command and the
  // side_question SDK control_request both read this snapshot, and neither
  // depends on prompt suggestions being enabled.
  if (querySource === 'repl_main_thread' || querySource === 'sdk') {
    saveCacheSafeParams(createCacheSafeParams(stopHookContext))
  }

  // Template job classification: when running as a dispatched job, classify
  // state after each turn. Gate on repl_main_thread so background forks
  // (extract-memories, auto-dream) don't pollute the timeline with their own
  // assistant messages. Await the classifier so state.json is written before
  // the turn returns — otherwise `claude list` shows stale state for the gap.
  // Env key hardcoded (vs importing JOB_ENV_KEY from jobs/state) to match the
  // require()-gated jobs/ import pattern above; spawn.test.ts asserts the
  // string matches.
  if (
    feature('TEMPLATES') &&
    process.env.CLAUDE_JOB_DIR &&
    querySource.startsWith('repl_main_thread') &&
    !toolUseContext.agentId
  ) {
    // Full turn history — assistantMessages resets each queryLoop iteration,
    // so tool calls from earlier iterations (Agent spawn, then summary) need
    // messagesForQuery to be visible in the tool-call summary.
    const turnAssistantMessages = stopHookContext.messages.filter(
      (m): m is AssistantMessage => m.type === 'assistant',
    )
    const p = jobClassifierModule!
      .classifyAndWriteState(process.env.CLAUDE_JOB_DIR, turnAssistantMessages)
      .catch(err => {
        logForDebugging(`[job] classifier error: ${errorMessage(err)}`, {
          level: 'error',
        })
      })
    await Promise.race([
      p,
      // eslint-disable-next-line no-restricted-syntax -- sleep() has no .unref(); timer must not block exit
      new Promise<void>(r => setTimeout(r, 60_000).unref()),
    ])
  }
  // --bare / SIMPLE: skip background bookkeeping (prompt suggestion,
  // memory extraction, auto-dream). Scripted -p calls don't want auto-memory
  // or forked agents contending for resources during shutdown.
  if (!isBareMode()) {
    // Inline env check for dead code elimination in external builds
    if (!isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION)) {
      void executePromptSuggestion(stopHookContext)
    }
    if (
      feature('EXTRACT_MEMORIES') &&
      !toolUseContext.agentId &&
      isExtractModeActive()
    ) {
      // Fire-and-forget in both interactive and non-interactive. For -p/SDK,
      // print.ts drains the in-flight promise after flushing the response
      // but before gracefulShutdownSync (see drainPendingExtraction).
      void extractMemoriesModule!.executeExtractMemories(
        stopHookContext,
        toolUseContext.appendSystemMessage,
      )
    }
    if (!toolUseContext.agentId) {
      void executeAutoDream(stopHookContext, toolUseContext.appendSystemMessage)
    }
  }

  // chicago MCP: auto-unhide + lock release at turn end.
  // Main thread only — the CU lock is a process-wide module-level variable,
  // so a subagent's stopHooks releasing it leaves the main thread's cleanup
  // seeing isLockHeldLocally()===false → no exit notification, and unhides
  // mid-turn. Subagents don't start CU sessions so this is a pure skip.
  if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
    try {
      const { cleanupComputerUseAfterTurn } = await import(
        '../utils/computerUse/cleanup.js'
      )
      await cleanupComputerUseAfterTurn(toolUseContext)
    } catch {
      // Failures are silent — this is dogfooding cleanup, not critical path
    }
  }

  const summaryMessages: Message[] = []
  try {
    const blockingErrors: Message[] = []
    const appState = toolUseContext.getAppState()
    const permissionMode = appState.toolPermissionContext.mode
    const stopHookTracker = createStopHookSummaryTracker()
    const stopHookStartTime = Date.now()

    const generator = executeStopHooks(
      permissionMode,
      toolUseContext.abortController.signal,
      undefined,
      stopHookActive ?? false,
      toolUseContext.agentId,
      toolUseContext,
      [...messagesForQuery, ...assistantMessages],
      toolUseContext.agentType,
    )

    for await (const result of generator) {
      if (result.message) {
        collectStopHookTelemetryFromResult(result, stopHookTracker)
      }
      if (result.blockingError) {
        const userMessage = createUserMessage({
          content: getStopHookMessage(result.blockingError),
          isMeta: true, // Hide from UI (shown in summary message instead)
        })
        blockingErrors.push(userMessage)
        stopHookTracker.hookErrors.push(result.blockingError.blockingError)
        stopHookTracker.hasOutput = true
      }
      // Check if hook wants to prevent continuation
      if (result.preventContinuation) {
        stopHookTracker.preventedContinuation = true
        stopHookTracker.stopReason =
          result.stopReason || 'Stop hook prevented continuation'
      }

      // Check if we were aborted during hook execution
      if (toolUseContext.abortController.signal.aborted) {
        logEvent('tengu_pre_stop_hooks_cancelled', {
          queryChainId: toolUseContext.queryTracking
            ?.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,

          queryDepth: toolUseContext.queryTracking?.depth,
        })
        yield createUserInterruptionMessage({
          toolUse: false,
        })
        return { blockingErrors: [], preventContinuation: true, summaryMessages }
      }
    }

    const stopHookDurationMs = Date.now() - stopHookStartTime
    maybeAddStopHookSummaryMessage(
      stopHookTracker,
      summaryMessages,
      'Stop',
      stopHookDurationMs,
    )

    if (stopHookTracker.hookErrors.length > 0) {
      // Send notification about errors (shown in verbose/transcript mode via ctrl+o)
      const expandShortcut = getShortcutDisplay(
        'app:toggleTranscript',
        'Global',
        'ctrl+o',
      )
      toolUseContext.addNotification?.({
        key: 'stop-hook-error',
        text: `Stop hook error occurred · ${expandShortcut} to see`,
        priority: 'immediate',
      })
    }

    if (stopHookTracker.preventedContinuation) {
      return { blockingErrors: [], preventContinuation: true, summaryMessages }
    }

    // Collect blocking errors from stop hooks
    if (blockingErrors.length > 0) {
      return { blockingErrors, preventContinuation: false, summaryMessages }
    }

    // After Stop hooks pass, run TeammateIdle and TaskCompleted hooks if this is a teammate
    if (isTeammate()) {
      const teammateName = getAgentName() ?? ''
      const teamName = getTeamName() ?? ''
      const teammateBlockingErrors: Message[] = []
      const taskCompletedTracker = createStopHookSummaryTracker()
      const teammateIdleTracker = createStopHookSummaryTracker()
      const taskCompletedStart = Date.now()

      // Run TaskCompleted hooks for any in-progress tasks owned by this teammate
      const taskListId = getTaskListId()
      const tasks = await listTasks(taskListId)
      const inProgressTasks = tasks.filter(
        t => t.status === 'in_progress' && t.owner === teammateName,
      )

      for (const task of inProgressTasks) {
        const taskCompletedGenerator = executeTaskCompletedHooks(
          task.id,
          task.subject,
          task.description,
          teammateName,
          teamName,
          permissionMode,
          toolUseContext.abortController.signal,
          undefined,
          toolUseContext,
        )

        for await (const result of taskCompletedGenerator) {
          if (result.message) {
            collectStopHookTelemetryFromResult(result, taskCompletedTracker)
          }
          if (result.blockingError) {
            const userMessage = createUserMessage({
              content: getTaskCompletedHookMessage(result.blockingError),
              isMeta: true,
            })
            teammateBlockingErrors.push(userMessage)
            taskCompletedTracker.hookErrors.push(
              result.blockingError.blockingError,
            )
          }
          if (result.preventContinuation) {
            taskCompletedTracker.preventedContinuation = true
            taskCompletedTracker.stopReason =
              result.stopReason || 'TaskCompleted hook prevented continuation'
          }
          if (toolUseContext.abortController.signal.aborted) {
            return { blockingErrors: [], preventContinuation: true, summaryMessages }
          }
        }
      }

      maybeAddStopHookSummaryMessage(
        taskCompletedTracker,
        summaryMessages,
        'TaskCompleted',
        Date.now() - taskCompletedStart,
      )

      // Run TeammateIdle hooks
      const teammateIdleStart = Date.now()
      const teammateIdleGenerator = executeTeammateIdleHooks(
        teammateName,
        teamName,
        permissionMode,
        toolUseContext.abortController.signal,
      )

      for await (const result of teammateIdleGenerator) {
        if (result.message) {
          collectStopHookTelemetryFromResult(result, teammateIdleTracker)
        }
        if (result.blockingError) {
          const userMessage = createUserMessage({
            content: getTeammateIdleHookMessage(result.blockingError),
            isMeta: true,
          })
          teammateBlockingErrors.push(userMessage)
          teammateIdleTracker.hookErrors.push(
            result.blockingError.blockingError,
          )
        }
        // Match Stop hook behavior: allow preventContinuation/stopReason
        if (result.preventContinuation) {
          teammateIdleTracker.preventedContinuation = true
          teammateIdleTracker.stopReason =
            result.stopReason || 'TeammateIdle hook prevented continuation'
        }
        if (toolUseContext.abortController.signal.aborted) {
          return { blockingErrors: [], preventContinuation: true, summaryMessages }
        }
      }
      maybeAddStopHookSummaryMessage(
        teammateIdleTracker,
        summaryMessages,
        'TeammateIdle',
        Date.now() - teammateIdleStart,
      )

      if (
        taskCompletedTracker.preventedContinuation ||
        teammateIdleTracker.preventedContinuation
      ) {
        return { blockingErrors: [], preventContinuation: true, summaryMessages }
      }

      if (teammateBlockingErrors.length > 0) {
        return {
          blockingErrors: teammateBlockingErrors,
          preventContinuation: false,
          summaryMessages,
        }
      }
    }

    return { blockingErrors: [], preventContinuation: false, summaryMessages }
  } catch (error) {
    const durationMs = Date.now() - hookStartTime
    logEvent('tengu_stop_hook_error', {
      duration: durationMs,

      queryChainId: toolUseContext.queryTracking
        ?.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      queryDepth: toolUseContext.queryTracking?.depth,
    })
    summaryMessages.push(
      createSystemMessage(
        `Stop hook failed: ${errorMessage(error)}`,
        'warning',
      ),
    )
    return {
      blockingErrors: [],
      preventContinuation: false,
      summaryMessages,
    }
  }
}
