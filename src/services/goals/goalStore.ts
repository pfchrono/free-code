import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getSessionId } from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { reseedProjectMemory } from '../memory/memoryReseed.js'
import { recordSessionTimelineEntry } from '../memory/sessionTimeline.js'

export type GoalStatus = 'active' | 'paused' | 'budget_limited' | 'complete'

export type ThreadGoal = {
  goalId: string
  sessionId: string
  objective: string
  status: GoalStatus
  tokenBudget?: number
  tokensUsed: number
  timeUsedSeconds: number
  contextState?: GoalContextState
  progressNotes?: GoalProgressNote[]
  createdAt: string
  updatedAt: string
}

export type GoalSnapshot = ThreadGoal & {
  remainingTokens?: number
}

export type GoalProgressNote = {
  at: string
  text: string
}

export type GoalContextState = {
  updatedAt: string
  summary: string
}

type StoredGoal = ThreadGoal

const MAX_PROGRESS_NOTES = 8
const MAX_PROGRESS_NOTE_CHARS = 1200

function goalsDir(): string {
  return join(getClaudeConfigHomeDir(), 'goals')
}

function goalPath(sessionId = getSessionId()): string {
  return join(goalsDir(), `${sessionId}.json`)
}

function toSnapshot(goal: ThreadGoal): GoalSnapshot {
  const remainingTokens =
    goal.tokenBudget === undefined
      ? undefined
      : Math.max(0, goal.tokenBudget - goal.tokensUsed)
  return { ...goal, remainingTokens }
}

function normalizeGoal(raw: StoredGoal): ThreadGoal {
  return {
    ...raw,
    tokensUsed: Number.isFinite(raw.tokensUsed) ? raw.tokensUsed : 0,
    timeUsedSeconds: Number.isFinite(raw.timeUsedSeconds)
      ? raw.timeUsedSeconds
      : 0,
    progressNotes: Array.isArray(raw.progressNotes)
      ? raw.progressNotes
          .filter(
            note =>
              note &&
              typeof note.at === 'string' &&
              typeof note.text === 'string' &&
              note.text.trim().length > 0,
          )
          .slice(-MAX_PROGRESS_NOTES)
      : undefined,
    contextState:
      raw.contextState &&
      typeof raw.contextState.updatedAt === 'string' &&
      typeof raw.contextState.summary === 'string' &&
      raw.contextState.summary.trim().length > 0
        ? raw.contextState
        : undefined,
  }
}

function normalizeProgressNote(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_PROGRESS_NOTE_CHARS)
}

export async function getGoal(sessionId = getSessionId()): Promise<GoalSnapshot | null> {
  try {
    const raw = await readFile(goalPath(sessionId), 'utf8')
    return toSnapshot(normalizeGoal(JSON.parse(raw) as StoredGoal))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function createGoal(
  objective: string,
  tokenBudget?: number,
  sessionId = getSessionId(),
): Promise<GoalSnapshot> {
  const existing = await getGoal(sessionId)
  if (existing && existing.status !== 'complete') {
    throw new Error('A goal already exists for this session')
  }

  const now = new Date().toISOString()
  const goal: ThreadGoal = {
    goalId: randomUUID(),
    sessionId,
    objective: objective.trim(),
    status: 'active',
    tokenBudget,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: now,
    updatedAt: now,
  }
  await mkdir(goalsDir(), { recursive: true })
  await writeFile(goalPath(sessionId), JSON.stringify(goal, null, 2), 'utf8')
  await recordSessionTimelineEntry({
    kind: 'goal',
    status: 'active',
    summary: `Goal set: ${goal.objective}`,
  })
  return toSnapshot(goal)
}

export async function replaceGoal(
  objective: string,
  tokenBudget?: number,
  sessionId = getSessionId(),
): Promise<GoalSnapshot> {
  await clearGoal(sessionId)
  return createGoal(objective, tokenBudget, sessionId)
}

export async function updateGoalStatus(
  status: GoalStatus,
  sessionId = getSessionId(),
): Promise<GoalSnapshot> {
  const current = await getGoal(sessionId)
  if (!current) {
    throw new Error('No active goal exists for this session')
  }
  const updated: ThreadGoal = {
    ...current,
    status,
    updatedAt: new Date().toISOString(),
  }
  await mkdir(goalsDir(), { recursive: true })
  await writeFile(goalPath(sessionId), JSON.stringify(updated, null, 2), 'utf8')
  await recordSessionTimelineEntry({
    kind: 'goal',
    status,
    summary: `Goal ${status}: ${updated.objective}`,
  })
  if (status === 'complete') {
    void reseedProjectMemory({
      source: 'goal',
      summary: `Completed goal: ${updated.objective}`,
      content: [
        `Goal completed: ${updated.objective}`,
        `Tokens used: ${updated.tokensUsed}`,
        `Time used seconds: ${updated.timeUsedSeconds}`,
        updated.contextState ? `Compact state: ${updated.contextState.summary}` : null,
        updated.progressNotes?.length
          ? `Recent progress:\n${updated.progressNotes.map(note => `- ${note.at}: ${note.text}`).join('\n')}`
          : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n\n'),
      tags: ['goal-complete'],
    })
  }
  return toSnapshot(updated)
}

export async function clearGoal(sessionId = getSessionId()): Promise<void> {
  await rm(goalPath(sessionId), { force: true })
}

export async function addGoalUsage(
  tokens: number,
  elapsedSeconds: number,
  sessionId = getSessionId(),
): Promise<GoalSnapshot | null> {
  const current = await getGoal(sessionId)
  if (!current || current.status !== 'active') return current

  const updated: ThreadGoal = {
    ...current,
    tokensUsed: current.tokensUsed + Math.max(0, Math.round(tokens)),
    timeUsedSeconds:
      current.timeUsedSeconds + Math.max(0, Math.round(elapsedSeconds)),
    updatedAt: new Date().toISOString(),
  }
  if (
    updated.tokenBudget !== undefined &&
    updated.tokensUsed >= updated.tokenBudget
  ) {
    updated.status = 'budget_limited'
  }
  await mkdir(goalsDir(), { recursive: true })
  await writeFile(goalPath(sessionId), JSON.stringify(updated, null, 2), 'utf8')
  await recordSessionTimelineEntry({
    kind: 'goal',
    status: updated.status,
    summary: `Goal usage: ${updated.objective}`,
  })
  return toSnapshot(updated)
}

export async function recordGoalProgress(
  text: string,
  sessionId = getSessionId(),
): Promise<GoalSnapshot | null> {
  const current = await getGoal(sessionId)
  if (!current || current.status !== 'active') return current

  const normalized = normalizeProgressNote(text)
  if (!normalized) return current
  const now = new Date().toISOString()

  const updated: ThreadGoal = {
    ...current,
    contextState: {
      updatedAt: now,
      summary: normalized,
    },
    progressNotes: [
      ...(current.progressNotes ?? []),
      { at: now, text: normalized },
    ].slice(-MAX_PROGRESS_NOTES),
    updatedAt: now,
  }
  await mkdir(goalsDir(), { recursive: true })
  await writeFile(goalPath(sessionId), JSON.stringify(updated, null, 2), 'utf8')
  await recordSessionTimelineEntry({
    kind: 'goal',
    status: 'active',
    summary: `Goal progress: ${normalized}`,
  })
  return toSnapshot(updated)
}

export function isGoalActive(goal: GoalSnapshot | null): goal is GoalSnapshot {
  return goal?.status === 'active'
}
