import type { Command } from '../../commands.js'
import { shouldAllowAnthropicHostedServices } from '../../utils/model/providers.js'

const installSlackApp = {
  type: 'local',
  name: 'install-slack-app',
  description: 'Install the Claude Slack app',
  availability: ['claude-ai'],
  isEnabled: () => shouldAllowAnthropicHostedServices(),
  supportsNonInteractive: false,
  load: () => import('./install-slack-app.js'),
} satisfies Command

export default installSlackApp
