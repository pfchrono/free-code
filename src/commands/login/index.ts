import type { Command } from '../../commands.js'

export default () =>
  ({
    type: 'local-jsx',
    name: 'login',
    description: 'Sign in with your hosted account',
    isEnabled: () => true,
    load: () => import('./login.js'),
  }) satisfies Command
