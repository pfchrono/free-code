const sessions = {
  type: 'local',
  name: 'sessions',
  description: 'Show session memory timeline and continuity tree',
  isEnabled: () => true,
  supportsNonInteractive: true,
  load: () => import('./sessions.js'),
} as const

export default sessions
