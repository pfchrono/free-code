import type { Command } from '../../commands.js'

const codex = {
  type: 'local-jsx',
  name: 'codex',
  description:
    'Store a repo-local ChatGPT Codex provider preference for future free-code launches',
  immediate: true,
  argumentHint: '[status|models|off]',
  load: () => import('./codex.js'),
} satisfies Command

export default codex
