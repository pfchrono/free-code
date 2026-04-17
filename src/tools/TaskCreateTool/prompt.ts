import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = 'Create a new task in the task list'

export function getPrompt(): string {
  const teammateContext = isAgentSwarmsEnabled()
    ? ' and potentially assigned to teammates'
    : ''

  const teammateTips = isAgentSwarmsEnabled()
    ? `- Include enough detail in the description for another agent to understand and complete the task
- New tasks are created with status 'pending' and no owner - use TaskUpdate with the \`owner\` parameter to assign them
`
    : ''

  return `Use this tool for multi-step or non-trivial work${teammateContext}. Create tasks once requirements are clear, especially for 3+ step jobs, plan mode, user task lists, or work that benefits from progress tracking.

Skip it for one small straightforward task or purely conversational asks.

Task fields:
- **subject**: brief imperative title (for example, "Fix authentication bug in login flow")
- **description**: what must be done
- **activeForm** (optional): present-continuous spinner label; if omitted, the spinner shows the subject

New tasks start as \`pending\`.

Tips:
- Make tasks specific and outcome-focused
- Use TaskUpdate immediately to mark work \`in_progress\`, \`completed\`, or add dependencies
${teammateTips}- Check TaskList first to avoid duplicates
`
}
