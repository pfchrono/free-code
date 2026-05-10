import type { LocalCommandCall } from '../../types/command.js'
import {
  clearGoal,
  getGoal,
  replaceGoal,
  updateGoalStatus,
} from '../../services/goals/goalStore.js'
import { buildGoalContinuationPrompt } from '../../services/goals/goalPrompt.js'

const STATUS_ARGS = new Set(['', 'status', 'show', 'get'])

function parseBudget(args: string): { objective: string; tokenBudget?: number } {
  const match = args.match(/\s+--budget\s+(\d+)\s*$/)
  if (!match) return { objective: args.trim() }
  return {
    objective: args.slice(0, match.index).trim(),
    tokenBudget: Number(match[1]),
  }
}

function stripReplacePrefix(args: string): { objectiveArgs: string; replace: boolean } {
  const trimmed = args.trim()
  if (/^replace(?:\s|$)/i.test(trimmed)) {
    return { objectiveArgs: trimmed.replace(/^replace(?:\s+|$)/i, '').trim(), replace: true }
  }
  if (/^--replace(?:\s|$)/i.test(trimmed)) {
    return { objectiveArgs: trimmed.replace(/^--replace(?:\s+|$)/i, '').trim(), replace: true }
  }
  return { objectiveArgs: trimmed, replace: false }
}

function formatGoal(goal: Awaited<ReturnType<typeof getGoal>>): string {
  if (!goal) return 'No session goal set.'
  const budget =
    goal.tokenBudget === undefined
      ? 'no token budget'
      : `${goal.tokensUsed}/${goal.tokenBudget} tokens`
  return [
    `Goal ${goal.status}: ${goal.objective}`,
    `Progress: ${budget}, ${goal.timeUsedSeconds}s`,
  ].join('\n')
}

async function setStatus(status: 'active' | 'paused' | 'complete'): Promise<string> {
  try {
    const goal = await updateGoalStatus(status)
    return `Goal ${status}: ${goal.objective}`
  } catch (error) {
    if (error instanceof Error) return error.message
    return String(error)
  }
}

export const call: LocalCommandCall = async (args = '') => {
  const trimmed = args.trim()
  const command = trimmed.toLowerCase()

  if (STATUS_ARGS.has(command)) {
    return { type: 'text', value: formatGoal(await getGoal()) }
  }

  if (command === 'clear' || command === 'delete' || command === 'reset') {
    await clearGoal()
    return { type: 'text', value: 'Goal cleared.' }
  }

  if (command === 'complete' || command === 'done') {
    return { type: 'text', value: await setStatus('complete') }
  }

  if (command === 'pause') {
    return { type: 'text', value: await setStatus('paused') }
  }

  if (command === 'resume') {
    return { type: 'text', value: await setStatus('active') }
  }

  const { objectiveArgs, replace } = stripReplacePrefix(trimmed)
  const { objective, tokenBudget } = parseBudget(objectiveArgs)
  if (!objective) {
    return { type: 'text', value: 'Usage: /goal <objective> [--budget tokens]\nReplace existing goal: /goal replace <objective> [--budget tokens]' }
  }

  const existing = await getGoal()
  if (existing && existing.status !== 'complete' && !replace) {
    return {
      type: 'text',
      value: [
        `A goal is already ${existing.status}: ${existing.objective}`,
        '',
        'Replace it?',
        `- yes: /goal replace ${objective}${tokenBudget ? ` --budget ${tokenBudget}` : ''}`,
        '- no: keep current goal and ignore this change',
        '- stop current goal: /goal clear',
      ].join('\n'),
    }
  }

  const goal = await replaceGoal(objective, tokenBudget)
  return {
    type: 'text',
    value: `Goal set: ${goal.objective}\nStarting now.`,
    shouldQuery: true,
    metaMessages: [buildGoalContinuationPrompt(goal)],
  }
}
