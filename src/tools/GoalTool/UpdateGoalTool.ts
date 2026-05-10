import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { updateGoalStatus } from '../../services/goals/goalStore.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { UPDATE_GOAL_TOOL_NAME } from './constants.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    status: z
      .literal('complete')
      .describe('Only complete is allowed; pause/resume/clear remain user actions.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    goal_id: z.string(),
    status: z.string(),
    objective: z.string(),
    tokens_used: z.number(),
    time_used_seconds: z.number(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

type Output = z.infer<OutputSchema>

export const UpdateGoalTool = buildTool({
  name: UPDATE_GOAL_TOOL_NAME,
  searchHint: 'mark session goal complete',
  maxResultSizeChars: 20_000,
  async description() {
    return 'Mark the active Free-Code session goal complete when the objective is genuinely achieved.'
  },
  async prompt() {
    return [
      'Use this only after auditing that the active goal is complete.',
      'Do not call this for partial progress or because tests merely passed unless that satisfies the goal.',
    ].join('\n')
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'UpdateGoal'
  },
  isEnabled() {
    return true
  },
  isConcurrencySafe() {
    return false
  },
  async call() {
    const goal = await updateGoalStatus('complete')
    return {
      data: {
        goal_id: goal.goalId,
        status: goal.status,
        objective: goal.objective,
        tokens_used: goal.tokensUsed,
        time_used_seconds: goal.timeUsedSeconds,
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const goal = content as Output
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Goal marked ${goal.status}: ${goal.objective}\nTokens used: ${goal.tokens_used}\nTime used: ${goal.time_used_seconds}s`,
    }
  },
} satisfies ToolDef<InputSchema, Output>)

