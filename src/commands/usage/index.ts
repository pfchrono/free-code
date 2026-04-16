import type { Command } from '../../commands.js'
import { isCodexSubscriber } from '../../utils/auth.js'
import { shouldAllowAnthropicHostedServices } from '../../utils/model/providers.js'

export default {
  type: 'local-jsx',
  name: 'usage',
  description: 'Show plan usage limits',
  isEnabled: () => shouldAllowAnthropicHostedServices() || isCodexSubscriber(),
  load: () => import('./usage.js'),
} satisfies Command
