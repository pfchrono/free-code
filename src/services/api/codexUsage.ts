import { useSyncExternalStore } from 'react'
import { getCurrentSessionTitle } from '../../utils/sessionStorage.js'
import { getSessionId } from '../../bootstrap/state.js'

export type CodexRateLimit = {
  label: string
  used_percentage: number | null
  remaining?: number | null
  limit?: number | null
  resets_at: string | null
}

export type CodexContextWindow = {
  context_window_size: number | null
  used_tokens: number | null
  remaining_tokens: number | null
  used_percentage: number | null
}

export type CodexUsageSnapshot = {
  session_id: string | null
  session_name?: string
  provider: 'openai' | 'copilot'
  usage_source: 'chatgpt-codex-stream' | 'github-copilot-stream'
  last_response_usage: {
    input_tokens: number
    output_tokens: number
    total_tokens: number | null
  } | null
  context_window: CodexContextWindow | null
  rate_limits: CodexRateLimit[]
  updated_at: string | null
}

const EMPTY_SNAPSHOT: CodexUsageSnapshot = {
  session_id: null,
  provider: 'openai',
  usage_source: 'chatgpt-codex-stream',
  last_response_usage: null,
  context_window: null,
  rate_limits: [],
  updated_at: null,
}

type CodexUsageUpdate = Partial<CodexUsageSnapshot>

let snapshot: CodexUsageSnapshot = EMPTY_SNAPSHOT
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

function buildBaseSnapshot(): CodexUsageSnapshot {
  const sessionId = getSessionId()
  return {
    ...EMPTY_SNAPSHOT,
    session_id: sessionId,
    session_name: getCurrentSessionTitle(sessionId) || undefined,
  }
}

function mergeRateLimits(nextRateLimits: CodexRateLimit[] | undefined): CodexRateLimit[] {
  if (!nextRateLimits) {
    return snapshot.rate_limits
  }
  return nextRateLimits.filter(limit => limit.used_percentage !== null || limit.remaining !== undefined || limit.limit !== undefined || limit.resets_at !== null)
}

export function setCodexUsage(update: CodexUsageUpdate): void {
  const nextSessionId = update.session_id ?? snapshot.session_id ?? getSessionId()
  const nextSnapshot: CodexUsageSnapshot = {
    ...buildBaseSnapshot(),
    ...snapshot,
    ...update,
    session_id: nextSessionId,
    session_name:
      update.session_name ??
      snapshot.session_name ??
      getCurrentSessionTitle(nextSessionId) ??
      undefined,
    rate_limits: mergeRateLimits(update.rate_limits),
    updated_at: update.updated_at ?? new Date().toISOString(),
  }

  snapshot = nextSnapshot
  notify()
}

export function clearCodexUsage(): void {
  snapshot = buildBaseSnapshot()
  notify()
}

export function getCodexUsage(): CodexUsageSnapshot {
  if (snapshot.session_id === null) {
    snapshot = buildBaseSnapshot()
  }
  return snapshot
}

export function subscribeCodexUsage(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCodexUsage(): CodexUsageSnapshot {
  return useSyncExternalStore(subscribeCodexUsage, getCodexUsage, getCodexUsage)
}
