import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'

const provider = {
  type: 'local-jsx',
  name: 'provider',
  description: 'Manage AI provider profiles (OpenAI, Ollama, Gemini, custom)',
  argumentHint: '[status|set <type>|discover|clear]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./provider.js'),
} satisfies Command

export default provider
