import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { createGoal } from '../../services/goals/goalStore.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { CREATE_GOAL_TOOL_NAME } from './constants.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    objective: z.string().min(1).describe('Concrete objective to pursue until complete'),
    token_budget: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Optional token budget for this goal'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    goal_id: z.string(),
    objective: z.string(),
    status: z.string(),
    token_budget: z.number().optional(),
    tokens_used: z.number(),
    remaining_tokens: z.number().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

type Output = z.infer<OutputSchema>

export const CreateGoalTool = buildTool({
  name: CREATE_GOAL_TOOL_NAME,
  searchHint: 'create a session goal',
  maxResultSizeChars: 20_000,
  async description() {
    return 'Create one active session goal that Free-Code should continue working on until completion.'
  },
  async prompt() {
    return [
      'Use this to create a concrete session goal when the user asks for a persistent objective.',
      'Only one non-complete goal can exist per session.',
    ].join('\n')
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'CreateGoal'
  },
  isEnabled() {
    return true
  },
  isConcurrencySafe() {
    return false
  },
  async call({ objective, token_budget }) {
    const goal = await createGoal(objective, token_budget)
    return {
      data: {
        goal_id: goal.goalId,
        objective: goal.objective,
        status: goal.status,
        token_budget: goal.tokenBudget,
        tokens_used: goal.tokensUsed,
        remaining_tokens: goal.remainingTokens,
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const goal = content as Output
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Goal created: ${goal.objective}\nStatus: ${goal.status}`,
    }
  },
} satisfies ToolDef<InputSchema, Output>)

