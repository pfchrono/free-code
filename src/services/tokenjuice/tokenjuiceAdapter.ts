import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { reduceExecution } from 'tokenjuice'
import type {
  ReduceOptions,
  ToolExecutionInput,
} from 'tokenjuice'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { logEvent } from '../analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../analytics/metadata.js'

type TokenjuiceMode = 'auto' | 'all-tools'

export type TokenjuiceToolResultContext = {
  toolName: string
  toolUseID: string
  toolInput?: unknown
  toolUseResult?: unknown
  durationMs?: number
}

type TokenjuiceSettings = {
  enabled?: boolean
  mode?: TokenjuiceMode
  minChars?: number
  maxInlineChars?: number
  timeoutMs?: number
  includeTools?: string[]
  excludeTools?: string[]
  storeRaw?: boolean
}

const DEFAULT_MIN_CHARS = 4000
const DEFAULT_MAX_INLINE_CHARS = 12000
const DEFAULT_TIMEOUT_MS = 1500
const MINIMUM_USEFUL_REDUCTION_RATIO = 0.98

const DEFAULT_EXCLUDED_TOOLS = new Set([
  'Edit',
  'ExitPlanMode',
  'Goal',
  'MultiEdit',
  'NotebookEdit',
  'Read',
  'Skill',
  'TodoWrite',
  'Write',
])

function getTokenjuiceSettings(): TokenjuiceSettings {
  return (getInitialSettings().tokenjuice ?? {}) as TokenjuiceSettings
}

function isTokenjuiceEnabled(settings: TokenjuiceSettings): boolean {
  if (isEnvDefinedFalsy(process.env.FREE_CODE_TOKENJUICE)) return false
  if (isEnvTruthy(process.env.FREE_CODE_TOKENJUICE)) return true
  return settings.enabled !== false
}

function shouldCompactTool(
  toolName: string,
  settings: TokenjuiceSettings,
): boolean {
  if (settings.excludeTools?.includes(toolName)) return false
  if (settings.includeTools?.includes(toolName)) return true
  if ((settings.mode ?? 'auto') === 'all-tools') return true
  return !DEFAULT_EXCLUDED_TOOLS.has(toolName)
}

function extractTextContent(
  content: ToolResultBlockParam['content'],
): { text: string; kind: 'string' | 'array' } | null {
  if (!content) return null
  if (typeof content === 'string') return { text: content, kind: 'string' }
  if (!Array.isArray(content)) return null
  if (content.some(block => block.type !== 'text')) return null
  return {
    text: content.map(block => block.text).join('\n'),
    kind: 'array',
  }
}

function buildContent(
  text: string,
  kind: 'string' | 'array',
): NonNullable<ToolResultBlockParam['content']> {
  if (kind === 'string') return text
  return [{ type: 'text', text }]
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function stringField(value: unknown, key: string): string | undefined {
  const record = getRecord(value)
  const field = record?.[key]
  return typeof field === 'string' ? field : undefined
}

function numberField(value: unknown, key: string): number | undefined {
  const record = getRecord(value)
  const field = record?.[key]
  return typeof field === 'number' && Number.isFinite(field)
    ? field
    : undefined
}

function inputArgs(value: unknown): Record<string, unknown> | undefined {
  const record = getRecord(value)
  return record ? { ...record } : undefined
}

function buildExecutionInput(
  text: string,
  context: TokenjuiceToolResultContext,
): ToolExecutionInput {
  const command =
    stringField(context.toolInput, 'command') ??
    stringField(context.toolUseResult, 'command')
  const stdout = stringField(context.toolUseResult, 'stdout')
  const stderr = stringField(context.toolUseResult, 'stderr')
  return {
    toolName: context.toolName,
    toolCallId: context.toolUseID,
    command,
    args: inputArgs(context.toolInput),
    cwd: getOriginalCwd(),
    stdout,
    stderr,
    combinedText: text,
    exitCode:
      numberField(context.toolUseResult, 'exitCode') ??
      numberField(context.toolUseResult, 'code'),
    durationMs: context.durationMs,
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Tokenjuice timed out after ${timeoutMs}ms`)),
      timeoutMs,
    )
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function compactToolResultWithTokenjuice(
  toolResultBlock: ToolResultBlockParam,
  context: TokenjuiceToolResultContext,
): Promise<ToolResultBlockParam> {
  const settings = getTokenjuiceSettings()
  if (!isTokenjuiceEnabled(settings)) return toolResultBlock
  if (!shouldCompactTool(context.toolName, settings)) return toolResultBlock

  const content = extractTextContent(toolResultBlock.content)
  if (!content) return toolResultBlock
  if (content.text.length < (settings.minChars ?? DEFAULT_MIN_CHARS)) {
    return toolResultBlock
  }

  const input = buildExecutionInput(content.text, context)
  const options: ReduceOptions = {
    cwd: getOriginalCwd(),
    maxInlineChars: settings.maxInlineChars ?? DEFAULT_MAX_INLINE_CHARS,
    recordStats: true,
    store: settings.storeRaw ?? false,
  }

  try {
    const result = await withTimeout(
      reduceExecution(input, options),
      settings.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
    const inlineText = result.inlineText?.trimEnd()
    if (
      !inlineText ||
      inlineText.length >= content.text.length * MINIMUM_USEFUL_REDUCTION_RATIO
    ) {
      return toolResultBlock
    }

    logEvent('tengu_tokenjuice_tool_result_compacted', {
      tool_name: sanitizeToolNameForAnalytics(context.toolName),
      raw_chars: result.stats.rawChars,
      reduced_chars: result.stats.reducedChars,
      ratio: result.stats.ratio,
      family: result.classification.family,
    })

    const footer =
      `[tokenjuice compacted ${result.stats.rawChars}->${result.stats.reducedChars} chars; ` +
      `family=${result.classification.family}]`
    return {
      ...toolResultBlock,
      content: buildContent(`${inlineText}\n\n${footer}`, content.kind),
    }
  } catch (error) {
    logForDebugging(
      `Tokenjuice compaction skipped for ${context.toolName}: ${jsonStringify(error)}`,
    )
    return toolResultBlock
  }
}
