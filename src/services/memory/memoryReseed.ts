import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
import { logForDebugging } from '../../utils/debug.js'
import { getMemorySystem } from './persistentMemorySystem.js'
import { recordSessionTimelineEntry } from './sessionTimeline.js'

export async function reseedProjectMemory(args: {
  source: 'goal' | 'handoff' | 'tte' | 'manual'
  summary: string
  content: string
  tags?: string[]
}): Promise<string | null> {
  const content = args.content.trim()
  if (!content) return null

  try {
    const memory = getMemorySystem()
    await memory.initialize()
    const id = await memory.saveProjectMemory({
      projectPath: getOriginalCwd(),
      sessionId: getSessionId(),
      summary: args.summary,
      content,
      tags: [args.source, 'continuity', ...(args.tags ?? [])],
      source: 'session-continuity',
      importance: 0.9,
      metadata: {
        reseedSource: args.source,
      },
    })
    void recordSessionTimelineEntry({
      kind: args.source === 'handoff' ? 'handoff' : 'compact',
      status: 'saved',
      summary: `Reseeded memory: ${args.summary}`,
      continuity: args.source === 'handoff' ? 'handoff' : 'compact',
    })
    return id
  } catch (error) {
    logForDebugging(`Failed to reseed project memory: ${error}`)
    return null
  }
}
