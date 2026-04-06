import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { shouldAllowAnthropicHostedServices } from '../../utils/model/providers.js'

const command: Command = {
  name: 'chrome',
  description: 'Claude in Chrome (Beta) settings',
  availability: ['claude-ai'],
  isEnabled: () =>
    shouldAllowAnthropicHostedServices() && !getIsNonInteractiveSession(),
  type: 'local-jsx',
  load: () => import('./chrome.js'),
}

export default command
