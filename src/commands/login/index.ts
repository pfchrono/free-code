import type { Command } from '../../commands.js'

export default () =>
  ({
    type: 'local-jsx',
    name: 'login',
    description: 'Sign in with your Anthropic account',
    isEnabled: () => true,
    load: () => import('./login.js'),
  }) satisfies Command
