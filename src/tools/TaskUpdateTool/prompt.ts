export const DESCRIPTION = 'Update a task in the task list'

export const PROMPT = `Use this tool to keep task state current.

Use it when progress changes:
- mark work \`in_progress\` before starting
- mark work \`completed\` only when fully done
- keep blocked work updated in the description

Do not mark tasks completed if tests fail, work is partial, errors remain, or required files/dependencies are missing.

You can also:
- delete tasks with \`deleted\`
- update subject, description, or activeForm when requirements change
- set dependencies with \`addBlocks\` and \`addBlockedBy\`
- set \`owner\` when assigning work

Updatable fields:
- **status**
- **subject**
- **description**
- **activeForm**
- **owner**
- **metadata**
- **addBlocks**
- **addBlockedBy**

Status flow: \`pending\` → \`in_progress\` → \`completed\`. Use \`deleted\` to remove a task.

Read the latest task with \`TaskGet\` before updating it.`
