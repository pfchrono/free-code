import type { Command } from '../../commands.js'

const dependencyGraph = {
  type: 'local-jsx',
  name: 'dependency-graph',
  description: 'Live dependency graph system for SQLite-backed codebase intelligence',
  immediate: true,
  argumentHint: '[status|init|context|deps <file>|search <term>|shutdown]',
  load: () => import('./dependency-graph.js'),
  aliases: ['deps', 'dep-graph'],
} satisfies Command

export default dependencyGraph