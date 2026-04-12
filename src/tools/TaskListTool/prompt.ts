import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = 'List all tasks in the task list'

export function getPrompt(): string {
  const teammateUseCase = isAgentSwarmsEnabled()
    ? `- Before assigning tasks to teammates, to see what's available
`
    : ''

  const idDescription = '- **id**: Task identifier (use with TaskGet, TaskUpdate)'

  const teammateWorkflow = isAgentSwarmsEnabled()
    ? `
## Teammate Workflow

When working as a teammate:
1. After completing your current task, call TaskList to find available work
2. Look for tasks with status 'pending', no owner, and empty blockedBy
3. **Prefer tasks in ID order** (lowest ID first) when multiple tasks are available, as earlier tasks often set up context for later ones
4. Claim an available task using TaskUpdate (set \`owner\` to your name), or wait for leader assignment
5. If blocked, focus on unblocking tasks or notify the team lead
`
    : ''

  return `Use this tool to list all tasks.

Use it to:
- find available work (pending, unowned, unblocked)
- check overall progress
- find blocked tasks and dependencies
${teammateUseCase}- check for newly unblocked work after finishing a task
- prefer lower task IDs when multiple tasks are available

Returns task summaries with:
${idDescription}
- **subject**: brief task title
- **status**: 'pending', 'in_progress', or 'completed'
- **owner**: assigned agent ID, if any
- **blockedBy**: open task IDs that must complete first

Use TaskGet for full task details.
${teammateWorkflow}`
}
