import type { Command } from '../../commands.js'

const openrouter = {
  type: 'local-jsx',
  name: 'openrouter',
  description:
    'Store a repo-local OpenRouter provider preference for future free-code launches',
  immediate: true,
  isSensitive: true,
  argumentHint: '[status|models|off|<api-key>]',
  load: () => import('./openrouter.js'),
} satisfies Command

export default openrouter
