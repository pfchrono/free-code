import type { Command } from '../../commands.js'

const status = {
  type: 'local',
  name: 'status',
  description:
    'Show current session, model, context, worktree, MCP, and agent policy status',
  supportsNonInteractive: true,
  load: () => import('./status.js'),
} satisfies Command

export default status
