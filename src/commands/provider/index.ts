import type { Command } from '../../commands.js'

const provider = {
  type: 'local-jsx',
  name: 'provider',
  description: 'Manage AI provider profiles (OpenAI, Ollama, Gemini, custom)',
  argumentHint: '[status|set <type>|discover|clear]',
  immediate: true,
  load: () => import('./provider.js'),
} satisfies Command

export default provider
