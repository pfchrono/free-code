import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { Command } from '../../types/command.js'
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
import { isAutoMemoryEnabled, getAutoMemPath } from '../../memdir/paths.js'
import { buildConsolidationPrompt } from '../../services/autoDream/consolidationPrompt.js'
import {
  listSessionsTouchedSince,
  readLastConsolidatedAt,
  recordConsolidation,
} from '../../services/autoDream/consolidationLock.js'
import { getProjectDir } from '../../utils/sessionStorage.js'

const command = {
  type: 'prompt',
  name: 'dream',
  description:
    'Run memory consolidation - synthesize recent sessions into durable memories',
  isEnabled: () => isAutoMemoryEnabled(),
  progressMessage: 'consolidating memories',
  contentLength: 0,
  source: 'builtin',
  async getPromptForCommand(): Promise<ContentBlockParam[]> {
    const memoryRoot = getAutoMemPath()
    const transcriptDir = getProjectDir(getOriginalCwd())

    let lastAt: number
    try {
      lastAt = await readLastConsolidatedAt()
    } catch {
      lastAt = 0
    }

    let sessionIds: string[]
    try {
      sessionIds = await listSessionsTouchedSince(lastAt)
    } catch {
      sessionIds = []
    }

    const currentSession = getSessionId()
    sessionIds = sessionIds.filter(id => id !== currentSession)

    if (sessionIds.length === 0) {
      sessionIds = [currentSession]
    }

    const hoursSince =
      lastAt > 0
        ? `${((Date.now() - lastAt) / 3_600_000).toFixed(1)}h ago`
        : 'never'

    const extra = `
**Manually triggered by user via /dream.**

Sessions since last consolidation (${sessionIds.length}, last run: ${hoursSince}):
${sessionIds.map(id => `- ${id}`).join('\n')}`

    const prompt = buildConsolidationPrompt(memoryRoot, transcriptDir, extra)

    await recordConsolidation()

    return [{ type: 'text', text: prompt }]
  },
} satisfies Command

export default command
