import type { Command } from '../../commands.js'

const openai = {
  type: 'local-jsx',
  name: 'openai',
  description:
    'Store a repo-local OpenAI provider preference for future free-code launches',
  immediate: true,
  argumentHint: '[status|off]',
  load: () => import('./openai.js'),
} satisfies Command

export default openai