import type { Command } from '../../types/command.js'

const onboardGithub = {
  name: 'onboard-github',
  description:
    'Interactive setup for GitHub Models: device login or PAT, saved to secure storage',
  type: 'local-jsx',
  load: () => import('./onboard-github.js'),
} satisfies Command

export default onboardGithub
