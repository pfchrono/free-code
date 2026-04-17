import type { UUID } from 'crypto'
import { dirname, join } from 'path'
import {
  mkdir,
  readFile,
  writeFile,
} from 'fs/promises'
import { getSessionId, getSessionProjectDir } from '../bootstrap/state.js'
import type { Message } from '../types/message.js'
import { getOriginalCwd } from '../bootstrap/state.js'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { isFsInaccessible } from './errors.js'
import { sanitizePath } from './path.js'
import { jsonParse, jsonStringify } from './slowOperations.js'

export type SessionResumeSource =
  | 'fresh'
  | 'visible_history'
  | 'core_persisted_memory'
  | 'checkpointed_state'

export type PersistedSessionCheckpointMetadata = {
  strategy?: string
  lastSummarizedMessageId?: string
  transcriptPath?: string
  persistedAt: string
}

export type PersistedSessionResumeMetadata = {
  source?: SessionResumeSource
  persistedAt: string
  detail?: string
}

export type PersistedCompactionEvent = {
  trigger: 'auto' | 'manual'
  strategy: string
  occurredAt: string
  beforeTokens?: number
  afterTokens?: number
  beforeMessages?: number
  afterMessages?: number
  retainedSummary?: string
  droppedSummary?: string
}

export type PersistedSessionContinuityMetadata = {
  sessionId: string
  projectPath: string
  startedAt: number
  lastActivity: number
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  activePlan?: string
  planName?: string
  completedTasks: string[]
  remainingTasks: string[]
  currentTask?: string
  workingFiles: string[]
  conversationSummary?: string
  keyInsights: string[]
  metadata: Record<string, unknown>
  persistedAt: string
}

export type PersistedSessionMemoryLineage = {
  authoritativeSource: 'persisted_session_state'
  importedLegacySources?: string[]
  legacySidecarDetected?: boolean
  persistedAt: string
}

export type PersistedSessionStateV1 = {
  version: 1
  visibleMessages?: Message[]
  coreMessages?: Message[]
  checkpointMetadata?: PersistedSessionCheckpointMetadata
  resumeMetadata?: PersistedSessionResumeMetadata
  compactionHistory?: PersistedCompactionEvent[]
  continuityMetadata?: PersistedSessionContinuityMetadata
  memoryLineage?: PersistedSessionMemoryLineage
}

export type PersistedSessionState = PersistedSessionStateV1

const PERSISTED_SESSION_STATE_FILENAME_SUFFIX = '.state.json'
export const MAX_PERSISTED_COMPACTION_HISTORY = 5

function getProjectDirForSession(projectDirOverride?: string): string {
  return (
    projectDirOverride ??
    getSessionProjectDir() ??
    join(getClaudeConfigHomeDir(), 'projects', sanitizePath(getOriginalCwd()))
  )
}

export function getPersistedSessionStatePath(
  sessionId: string = getSessionId(),
  opts: {
    transcriptPath?: string
    projectDir?: string
  } = {},
): string {
  if (opts.transcriptPath) {
    return opts.transcriptPath.replace(/\.jsonl$/i, PERSISTED_SESSION_STATE_FILENAME_SUFFIX)
  }

  return join(
    getProjectDirForSession(opts.projectDir),
    `${sessionId}${PERSISTED_SESSION_STATE_FILENAME_SUFFIX}`,
  )
}

function isMessageArray(value: unknown): value is Message[] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        typeof item === 'object' &&
        item !== null &&
        'type' in item &&
        typeof item.type === 'string',
    )
  )
}

export function parsePersistedSessionState(
  raw: unknown,
): PersistedSessionState | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }

  const candidate = raw as Record<string, unknown>
  if (candidate.version !== 1) {
    return null
  }

  const state: PersistedSessionState = {
    version: 1,
  }

  if (isMessageArray(candidate.visibleMessages)) {
    state.visibleMessages = candidate.visibleMessages
  }
  if (isMessageArray(candidate.coreMessages)) {
    state.coreMessages = candidate.coreMessages
  }
  if (
    typeof candidate.checkpointMetadata === 'object' &&
    candidate.checkpointMetadata !== null
  ) {
    const checkpoint = candidate.checkpointMetadata as Record<string, unknown>
    if (typeof checkpoint.persistedAt === 'string') {
      state.checkpointMetadata = {
        persistedAt: checkpoint.persistedAt,
        strategy:
          typeof checkpoint.strategy === 'string'
            ? checkpoint.strategy
            : undefined,
        lastSummarizedMessageId:
          typeof checkpoint.lastSummarizedMessageId === 'string'
            ? checkpoint.lastSummarizedMessageId
            : undefined,
        transcriptPath:
          typeof checkpoint.transcriptPath === 'string'
            ? checkpoint.transcriptPath
            : undefined,
      }
    }
  }
  if (
    typeof candidate.resumeMetadata === 'object' &&
    candidate.resumeMetadata !== null
  ) {
    const resume = candidate.resumeMetadata as Record<string, unknown>
    if (typeof resume.persistedAt === 'string') {
      state.resumeMetadata = {
        persistedAt: resume.persistedAt,
        source:
          resume.source === 'fresh' ||
          resume.source === 'visible_history' ||
          resume.source === 'core_persisted_memory' ||
          resume.source === 'checkpointed_state'
            ? resume.source
            : undefined,
        detail:
          typeof resume.detail === 'string' ? resume.detail : undefined,
      }
    }
  }
  if (Array.isArray(candidate.compactionHistory)) {
    state.compactionHistory = candidate.compactionHistory
      .filter(
        item =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).occurredAt === 'string' &&
          typeof (item as Record<string, unknown>).strategy === 'string' &&
          typeof (item as Record<string, unknown>).trigger === 'string',
      )
      .map(item => {
        const event = item as Record<string, unknown>
        return {
          trigger:
            event.trigger === 'auto' ? 'auto' : 'manual',
          strategy: event.strategy as string,
          occurredAt: event.occurredAt as string,
          beforeTokens:
            typeof event.beforeTokens === 'number'
              ? event.beforeTokens
              : undefined,
          afterTokens:
            typeof event.afterTokens === 'number'
              ? event.afterTokens
              : undefined,
          beforeMessages:
            typeof event.beforeMessages === 'number'
              ? event.beforeMessages
              : undefined,
          afterMessages:
            typeof event.afterMessages === 'number'
              ? event.afterMessages
              : undefined,
          retainedSummary:
            typeof event.retainedSummary === 'string'
              ? event.retainedSummary
              : undefined,
          droppedSummary:
            typeof event.droppedSummary === 'string'
              ? event.droppedSummary
              : undefined,
        } satisfies PersistedCompactionEvent
      })
      .slice(-MAX_PERSISTED_COMPACTION_HISTORY)
  }
  if (
    typeof candidate.continuityMetadata === 'object' &&
    candidate.continuityMetadata !== null
  ) {
    const continuity = candidate.continuityMetadata as Record<string, unknown>
    if (
      typeof continuity.sessionId === 'string' &&
      typeof continuity.projectPath === 'string' &&
      typeof continuity.startedAt === 'number' &&
      typeof continuity.lastActivity === 'number' &&
      typeof continuity.persistedAt === 'string'
    ) {
      state.continuityMetadata = {
        sessionId: continuity.sessionId,
        projectPath: continuity.projectPath,
        startedAt: continuity.startedAt,
        lastActivity: continuity.lastActivity,
        status:
          continuity.status === 'paused' ||
          continuity.status === 'completed' ||
          continuity.status === 'abandoned'
            ? continuity.status
            : 'active',
        activePlan:
          typeof continuity.activePlan === 'string'
            ? continuity.activePlan
            : undefined,
        planName:
          typeof continuity.planName === 'string'
            ? continuity.planName
            : undefined,
        completedTasks: Array.isArray(continuity.completedTasks)
          ? continuity.completedTasks.filter(
              item => typeof item === 'string',
            )
          : [],
        remainingTasks: Array.isArray(continuity.remainingTasks)
          ? continuity.remainingTasks.filter(
              item => typeof item === 'string',
            )
          : [],
        currentTask:
          typeof continuity.currentTask === 'string'
            ? continuity.currentTask
            : undefined,
        workingFiles: Array.isArray(continuity.workingFiles)
          ? continuity.workingFiles.filter(item => typeof item === 'string')
          : [],
        conversationSummary:
          typeof continuity.conversationSummary === 'string'
            ? continuity.conversationSummary
            : undefined,
        keyInsights: Array.isArray(continuity.keyInsights)
          ? continuity.keyInsights.filter(item => typeof item === 'string')
          : [],
        metadata:
          typeof continuity.metadata === 'object' && continuity.metadata !== null
            ? (continuity.metadata as Record<string, unknown>)
            : {},
        persistedAt: continuity.persistedAt,
      }
    }
  }
  if (
    typeof candidate.memoryLineage === 'object' &&
    candidate.memoryLineage !== null
  ) {
    const lineage = candidate.memoryLineage as Record<string, unknown>
    if (typeof lineage.persistedAt === 'string') {
      state.memoryLineage = {
        authoritativeSource: 'persisted_session_state',
        importedLegacySources: Array.isArray(lineage.importedLegacySources)
          ? lineage.importedLegacySources.filter(item => typeof item === 'string')
          : undefined,
        legacySidecarDetected:
          typeof lineage.legacySidecarDetected === 'boolean'
            ? lineage.legacySidecarDetected
            : undefined,
        persistedAt: lineage.persistedAt,
      }
    }
  }

  return state
}

export async function loadPersistedSessionState(
  sessionId: string,
  opts: {
    transcriptPath?: string
    projectDir?: string
  } = {},
): Promise<PersistedSessionState | null> {
  const path = getPersistedSessionStatePath(sessionId, opts)

  try {
    const raw = await readFile(path, 'utf-8')
    return parsePersistedSessionState(jsonParse(raw))
  } catch (error) {
    if (isFsInaccessible(error)) {
      return null
    }
    return null
  }
}

export async function savePersistedSessionState(
  sessionId: UUID,
  state: PersistedSessionState,
  opts: {
    transcriptPath?: string
    projectDir?: string
  } = {},
): Promise<void> {
  const path = getPersistedSessionStatePath(sessionId, opts)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, jsonStringify(state), {
    encoding: 'utf8',
    mode: 0o600,
  })
}

export function mergePersistedCompactionHistory(
  existing: PersistedCompactionEvent[] | undefined,
  event: PersistedCompactionEvent,
): PersistedCompactionEvent[] {
  return [...(existing ?? []), event].slice(-MAX_PERSISTED_COMPACTION_HISTORY)
}

export async function recordPersistedResumeMetadata(
  sessionId: UUID,
  source: SessionResumeSource,
  detail?: string,
  opts: {
    transcriptPath?: string
    projectDir?: string
  } = {},
): Promise<void> {
  const existing = await loadPersistedSessionState(sessionId, opts)
  await savePersistedSessionState(
    sessionId,
    {
      ...(existing ?? { version: 1 }),
      version: 1,
      resumeMetadata: {
        source,
        detail,
        persistedAt: new Date().toISOString(),
      },
    },
    opts,
  )
}

export async function persistCompactedSessionState(
  sessionId: UUID,
  params: {
    visibleMessages: Message[]
    coreMessages?: Message[]
    event: PersistedCompactionEvent
    checkpointMetadata?: Omit<PersistedSessionCheckpointMetadata, 'persistedAt'>
    transcriptPath?: string
    projectDir?: string
  },
): Promise<void> {
  const existing = await loadPersistedSessionState(sessionId, {
    transcriptPath: params.transcriptPath,
    projectDir: params.projectDir,
  })
  await savePersistedSessionState(
    sessionId,
    {
      version: 1,
      visibleMessages: params.visibleMessages,
      coreMessages: params.coreMessages ?? params.visibleMessages,
      checkpointMetadata: params.checkpointMetadata
        ? {
            ...params.checkpointMetadata,
            persistedAt: new Date().toISOString(),
          }
        : existing?.checkpointMetadata,
      resumeMetadata: existing?.resumeMetadata,
      compactionHistory: mergePersistedCompactionHistory(
        existing?.compactionHistory,
        params.event,
      ),
      continuityMetadata: existing?.continuityMetadata,
      memoryLineage: existing?.memoryLineage,
    },
    {
      transcriptPath: params.transcriptPath,
      projectDir: params.projectDir,
    },
  )
}

export async function updatePersistedSessionContinuity(
  sessionId: UUID,
  continuityMetadata: Omit<PersistedSessionContinuityMetadata, 'persistedAt'>,
  opts: {
    transcriptPath?: string
    projectDir?: string
  } = {},
): Promise<void> {
  const existing = await loadPersistedSessionState(sessionId, opts)
  await savePersistedSessionState(
    sessionId,
    {
      ...(existing ?? { version: 1 }),
      version: 1,
      continuityMetadata: {
        ...continuityMetadata,
        persistedAt: new Date().toISOString(),
      },
      memoryLineage: {
        authoritativeSource: 'persisted_session_state',
        importedLegacySources: existing?.memoryLineage?.importedLegacySources,
        legacySidecarDetected:
          existing?.memoryLineage?.legacySidecarDetected ?? false,
        persistedAt: new Date().toISOString(),
      },
    },
    opts,
  )
}

export async function markPersistedSessionLegacySources(
  sessionId: UUID,
  legacySources: string[],
  opts: {
    transcriptPath?: string
    projectDir?: string
  } = {},
): Promise<void> {
  const existing = await loadPersistedSessionState(sessionId, opts)
  const mergedSources = Array.from(
    new Set([
      ...(existing?.memoryLineage?.importedLegacySources ?? []),
      ...legacySources,
    ]),
  )

  await savePersistedSessionState(
    sessionId,
    {
      ...(existing ?? { version: 1 }),
      version: 1,
      memoryLineage: {
        authoritativeSource: 'persisted_session_state',
        importedLegacySources: mergedSources,
        legacySidecarDetected: mergedSources.length > 0,
        persistedAt: new Date().toISOString(),
      },
    },
    opts,
  )
}
