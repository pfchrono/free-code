import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { getGoal } from '../../services/goals/goalStore.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { GET_GOAL_TOOL_NAME } from './constants.js'

const inputSchema = lazySchema(() => z.strictObject({}))
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    goal: z
      .object({
        goal_id: z.string(),
        objective: z.string(),
        status: z.string(),
        token_budget: z.number().optional(),
        tokens_used: z.number(),
        remaining_tokens: z.number().optional(),
        time_used_seconds: z.number(),
        context_state: z
          .object({
            updated_at: z.string(),
            summary: z.string(),
          })
          .optional(),
        progress_notes: z
          .array(
            z.object({
              at: z.string(),
              text: z.string(),
            }),
          )
          .optional(),
      })
      .nullable(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

type Output = z.infer<OutputSchema>

export const GetGoalTool = buildTool({
  name: GET_GOAL_TOOL_NAME,
  searchHint: 'inspect session goal',
  maxResultSizeChars: 20_000,
  async description() {
    return 'Get the active Free-Code session goal and its progress.'
  },
  async prompt() {
    return 'Use this to inspect the current session goal before deciding whether it is complete.'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'GetGoal'
  },
  isEnabled() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  async call() {
    const goal = await getGoal()
    return {
      data: {
        goal: goal
          ? {
              goal_id: goal.goalId,
              objective: goal.objective,
              status: goal.status,
              token_budget: goal.tokenBudget,
              tokens_used: goal.tokensUsed,
              remaining_tokens: goal.remainingTokens,
              time_used_seconds: goal.timeUsedSeconds,
              context_state: goal.contextState
                ? {
                    updated_at: goal.contextState.updatedAt,
                    summary: goal.contextState.summary,
                  }
                : undefined,
              progress_notes: goal.progressNotes,
            }
          : null,
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const { goal } = content as Output
    const progressNotes = goal?.progress_notes?.length
      ? `\nProgress notes:\n${goal.progress_notes
          .map(note => `- ${note.at}: ${note.text}`)
          .join('\n')}`
      : ''
    const contextState = goal?.context_state
      ? `\nCompact state (${goal.context_state.updated_at}):\n${goal.context_state.summary}`
      : ''
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: goal
        ? `Goal: ${goal.objective}\nStatus: ${goal.status}\nTokens: ${goal.tokens_used}${goal.token_budget ? `/${goal.token_budget}` : ''}${contextState}${progressNotes}`
        : 'No session goal is set.',
    }
  },
} as any)
