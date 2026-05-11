import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import type { GoalSnapshot, ThreadGoal } from './goalStore.js'

function getGoalCheckpointPaths(
  sessionId: string,
  configHomeDir = getClaudeConfigHomeDir(),
): { dir: string; file: string } {
  const dir = join(configHomeDir, 'goals')
  return {
    dir,
    file: join(dir, `${sessionId}.checkpoint.md`),
  }
}

export function goalCheckpointPath(sessionId: string): string {
  return getGoalCheckpointPaths(sessionId).file
}

function formatBudget(goal: ThreadGoal | GoalSnapshot): string {
  if (goal.tokenBudget === undefined) return 'none'
  const remaining =
    'remainingTokens' in goal && typeof goal.remainingTokens === 'number'
      ? goal.remainingTokens
      : Math.max(0, goal.tokenBudget - goal.tokensUsed)
  return `${goal.tokensUsed}/${goal.tokenBudget} tokens used, ${remaining} remaining`
}

export async function writeGoalCheckpoint(goal: ThreadGoal | GoalSnapshot): Promise<void> {
  const configHomeDir = getClaudeConfigHomeDir()
  const progressNotes = goal.progressNotes ?? []
  const content = [
    '# Free-Code Goal Checkpoint',
    '',
    `Session: ${goal.sessionId}`,
    `Goal ID: ${goal.goalId}`,
    `Status: ${goal.status}`,
    `Updated: ${goal.updatedAt}`,
    '',
    '## Objective',
    '',
    goal.objective,
    '',
    '## Budget',
    '',
    formatBudget(goal),
    `Time used: ${goal.timeUsedSeconds}s`,
    '',
    '## Compact State',
    '',
    goal.contextState?.summary ?? 'No compact state recorded yet.',
    '',
    '## Recent Progress',
    '',
    ...(progressNotes.length
      ? progressNotes.map(note => `- ${note.at}: ${note.text}`)
      : ['- No progress notes recorded yet.']),
    '',
    '## Resume Rule',
    '',
    'Continue from this checkpoint until the objective is complete, budget-limited, or blocked with explicit next requirements.',
    '',
  ].join('\n')

  const { dir, file } = getGoalCheckpointPaths(goal.sessionId, configHomeDir)
  await mkdir(dir, { recursive: true })
  await writeFile(file, content, 'utf8')
}

export async function removeGoalCheckpoint(sessionId: string): Promise<void> {
  await rm(goalCheckpointPath(sessionId), { force: true })
}
