import type { Command } from '../../commands.js'
import { shouldAllowAnthropicHostedServices } from '../../utils/model/providers.js'

export default {
  type: 'local-jsx',
  name: 'usage',
  description: 'Show plan usage limits',
  availability: ['claude-ai'],
  isEnabled: () => shouldAllowAnthropicHostedServices(),
  load: () => import('./usage.js'),
} satisfies Command
