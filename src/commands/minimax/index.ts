import type { Command } from '../../commands.js'

const minimax = {
  type: 'local-jsx',
  name: 'minimax',
  description:
    'Store a repo-local MiniMax provider preference for future free-code launches',
  immediate: true,
  argumentHint: '[status|models|usage|off|<api-key>]',
  load: () => import('./minimax.js'),
} satisfies Command

export default minimax
