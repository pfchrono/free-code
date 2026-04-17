export const DESCRIPTION = 'Get a task by ID from the task list'

export const PROMPT = `Use this tool to retrieve a task by ID.

Use it to:
- get full task context before starting work
- inspect dependencies (what it blocks and what blocks it)
- review full requirements after assignment

Returns full task details:
- **subject**: task title
- **description**: detailed requirements and context
- **status**: 'pending', 'in_progress', or 'completed'
- **blocks**: tasks waiting on this one
- **blockedBy**: tasks that must complete first

Before starting, make sure blockedBy is empty.
Use TaskList for summary views.
`
