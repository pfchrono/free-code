import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'

export const PROMPT = `Use this tool to create a structured task list for the current session.

Use it when:
- work has 3+ meaningful steps
- the task is non-trivial or needs planning
- the user asks for a todo list
- the user gives multiple tasks
- new instructions arrive and should be tracked
- you start work on a task
- you finish a task and discover follow-up work

Do not use it when:
- there is only one simple task
- tracking adds no value
- the work is purely conversational or informational

Task rules:
- mark a task \'in_progress\' before starting it
- keep exactly one task in_progress at a time
- mark tasks completed immediately after finishing
- remove tasks that are no longer relevant
- keep blocked tasks in_progress and add a new task for the blocker
- never mark a task completed if tests fail, work is partial, errors remain, or needed files/dependencies are missing

Task content:
- create clear, actionable items
- break larger work into smaller steps
- always provide both forms:
  - content: imperative form like \'Run tests\'
  - activeForm: present continuous like \'Running tests\'

When in doubt, use this tool for multi-step work.`

export const DESCRIPTION =
  'Create and manage the task list for the current session. Use it proactively for multi-step work, keep exactly one task in_progress, and always provide both content and activeForm.'
