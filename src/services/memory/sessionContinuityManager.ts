/**
 * Session Continuity Manager - Phase 1 Implementation
 * Inspired by oh-my-openagent's boulder.json session persistence
 */

import { z } from 'zod'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { logForDebugging } from '../../utils/debug.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getMemorySystem, type MemoryEntry } from './persistentMemorySystem.js'
import {
  loadPersistedSessionState,
  type PersistedSessionContinuityMetadata,
  updatePersistedSessionContinuity,
} from '../../utils/persistedSessionState.js'

// Session State Schema
const sessionStateSchema = z.object({
  sessionId: z.string(),
  projectPath: z.string(),
  startedAt: z.number(),
  lastActivity: z.number(),
  status: z.enum(['active', 'paused', 'completed', 'abandoned']),

  // Task tracking (inspired by boulder.json)
  activePlan: z.string().optional(),
  planName: z.string().optional(),
  completedTasks: z.array(z.string()).default([]),
  remainingTasks: z.array(z.string()).default([]),
  currentTask: z.string().optional(),

  // Context preservation
  workingFiles: z.array(z.string()).default([]),
  conversationSummary: z.string().optional(),
  keyInsights: z.array(z.string()).default([]),
  recentFiles: z.array(z.string()).default([]),
  recentSymbols: z.array(z.string()).default([]),
  recentTasks: z.array(z.string()).default([]),
  recentDecisions: z.array(z.string()).default([]),

  // Metadata
  metadata: z.record(z.string(), z.unknown()).default({}),
})

const sessionHistorySchema = z.object({
  version: z.string(),
  sessions: z.array(sessionStateSchema),
  currentSessionId: z.string().optional(),
})

export type SessionState = z.infer<typeof sessionStateSchema>
export type SessionHistory = z.infer<typeof sessionHistorySchema>

export interface ResumeSnapshot {
  sessionId: string
  workspaceId: string
  branchName?: string
  lastActiveAt: number
  recentFiles: string[]
  recentSymbols: string[]
  recentTasks: string[]
  recentDecisions: string[]
  changedFilesSinceLastSession?: string[]
  impactedTests?: string[]
  suggestedResumeNotes?: string[]
  checkpointId?: string
}

export interface SessionActivityRecord {
  files?: string[]
  symbols?: string[]
  task?: string
  decision?: string
}

interface SessionContinuityConfig {
  sessionDir: string
  autoSaveInterval: number
  maxSessions: number
  sessionTTL: number
}

class SessionContinuityManager {
  private config: SessionContinuityConfig
  private sessionHistory: SessionHistory
  private currentSession: SessionState | null = null
  private saveTimeout: NodeJS.Timeout | null = null

  constructor(config: Partial<SessionContinuityConfig> = {}) {
    this.config = {
      sessionDir: join(getClaudeConfigHomeDir(), 'sessions'),
      autoSaveInterval: 30000, // 30 seconds
      maxSessions: 100,
      sessionTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
      ...config,
    }

    this.sessionHistory = {
      version: '1.0.0',
      sessions: [],
    }
  }

  async initialize(): Promise<void> {
    try {
      await mkdir(this.config.sessionDir, { recursive: true })
      await this.loadSessionHistory()

      // Resume current session if exists
      if (this.sessionHistory.currentSessionId) {
        const session = this.sessionHistory.sessions.find(
          s => s.sessionId === this.sessionHistory.currentSessionId
        )
        if (session) {
          this.currentSession = session
          logForDebugging(`[Session] Resumed session: ${session.sessionId}`)
        }
      }

      logForDebugging('[Session] Session continuity manager initialized')
    } catch (error) {
      logForDebugging(`[Session] Failed to initialize: ${error}`)
    }
  }

  /**
   * Start a new session
   */
  async startSession(projectPath: string, metadata: Record<string, any> = {}): Promise<string> {
    const sessionId =
      typeof metadata.sessionId === 'string'
        ? metadata.sessionId
        : this.generateSessionId()

    // End current session if exists
    if (this.currentSession) {
      await this.endCurrentSession()
    }

    const newSession: SessionState = {
      sessionId,
      projectPath,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      status: 'active',
      completedTasks: [],
      remainingTasks: [],
      workingFiles: [],
      keyInsights: [],
      recentFiles: [],
      recentSymbols: [],
      recentTasks: [],
      recentDecisions: [],
      metadata,
    }

    this.currentSession = newSession
    this.sessionHistory.sessions.push(newSession)
    this.sessionHistory.currentSessionId = sessionId

    // Add to persistent memory
    const memorySystem = getMemorySystem()
    await memorySystem.addEntry({
      type: 'session',
      content: `Started new session for project: ${projectPath}`,
      sessionId,
      projectPath,
      metadata: { action: 'session_start', ...metadata },
      importance: 0.8,
    })

    await this.saveSessionHistory()
    await this.persistCurrentSession()
    logForDebugging(`[Session] Started new session: ${sessionId}`)

    return sessionId
  }

  /**
   * Get the current active session
   */
  getCurrentSession(): SessionState | null {
    return this.currentSession
  }

  /**
   * Update current session state
   */
  async updateSession(updates: Partial<Omit<SessionState, 'sessionId'>>): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session to update')
    }

    const oldSession = { ...this.currentSession }
    this.currentSession = {
      ...this.currentSession,
      ...updates,
      lastActivity: Date.now(),
    }

    // Update in history
    const index = this.sessionHistory.sessions.findIndex(
      s => s.sessionId === this.currentSession!.sessionId
    )
    if (index !== -1) {
      this.sessionHistory.sessions[index] = this.currentSession
    }

    // Log significant changes to memory
    await this.logSessionChanges(oldSession, this.currentSession)

    this.debouncedSave()
    await this.persistCurrentSession()
    logForDebugging(`[Session] Updated session: ${this.currentSession.sessionId}`)
  }

  /**
   * Add a task to the current session
   */
  async addTask(taskDescription: string, isPriority: boolean = false): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session to add task to')
    }

    if (isPriority) {
      this.currentSession.remainingTasks.unshift(taskDescription)
    } else {
      this.currentSession.remainingTasks.push(taskDescription)
    }

    await this.updateSession({ remainingTasks: this.currentSession.remainingTasks })

    // Add to memory
    const memorySystem = getMemorySystem()
    await memorySystem.addEntry({
      type: 'task',
      content: `Added task: ${taskDescription}`,
      sessionId: this.currentSession.sessionId,
      projectPath: this.currentSession.projectPath,
      metadata: { action: 'task_add', priority: isPriority },
    })
  }

  /**
   * Complete a task in the current session
   */
  async completeTask(taskDescription: string): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session to complete task in')
    }

    const taskIndex = this.currentSession.remainingTasks.indexOf(taskDescription)
    if (taskIndex === -1) {
      throw new Error('Task not found in remaining tasks')
    }

    // Move from remaining to completed
    this.currentSession.remainingTasks.splice(taskIndex, 1)
    this.currentSession.completedTasks.push(taskDescription)

    await this.updateSession({
      remainingTasks: this.currentSession.remainingTasks,
      completedTasks: this.currentSession.completedTasks,
    })

    // Add to memory
    const memorySystem = getMemorySystem()
    await memorySystem.addEntry({
      type: 'task',
      content: `Completed task: ${taskDescription}`,
      sessionId: this.currentSession.sessionId,
      projectPath: this.currentSession.projectPath,
      metadata: { action: 'task_complete' },
      importance: 0.7,
    })
  }

  /**
   * Add insight to the current session
   */
  async addInsight(insight: string, importance: number = 0.6): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session to add insight to')
    }

    this.currentSession.keyInsights.push(insight)
    await this.updateSession({ keyInsights: this.currentSession.keyInsights })

    // Add to memory
    const memorySystem = getMemorySystem()
    await memorySystem.addEntry({
      type: 'insight',
      content: insight,
      sessionId: this.currentSession.sessionId,
      projectPath: this.currentSession.projectPath,
      importance,
      tags: ['insight', 'session'],
    })
  }

  /**
   * Track a file being worked on
   */
  async trackWorkingFile(filePath: string): Promise<void> {
    if (!this.currentSession) return

    if (!this.currentSession.workingFiles.includes(filePath)) {
      this.currentSession.workingFiles.push(filePath)
    }

    this.currentSession.recentFiles = this.mergeRecentItems(
      this.currentSession.recentFiles,
      [filePath],
    )
    this.currentSession.lastActivity = Date.now()
    this.debouncedSave()
    await this.persistCurrentSession()

    // Add to memory
    const memorySystem = getMemorySystem()
    await memorySystem.addEntry({
      type: 'context',
      content: `Working on file: ${filePath}`,
      sessionId: this.currentSession.sessionId,
      projectPath: this.currentSession.projectPath,
      metadata: { action: 'file_access', filePath },
    })
  }

  async recordActivity(activity: SessionActivityRecord): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session to record activity for')
    }

    const recentFiles = this.mergeRecentItems(
      this.currentSession.recentFiles,
      activity.files,
    )
    const recentSymbols = this.mergeRecentItems(
      this.currentSession.recentSymbols,
      activity.symbols,
    )
    const recentTasks = this.mergeRecentItems(
      this.currentSession.recentTasks,
      activity.task ? [activity.task] : undefined,
    )
    const recentDecisions = this.mergeRecentItems(
      this.currentSession.recentDecisions,
      activity.decision ? [activity.decision] : undefined,
    )

    await this.updateSession({
      workingFiles: this.currentSession.workingFiles,
      recentFiles,
      recentSymbols,
      recentTasks,
      recentDecisions,
      ...(activity.task ? { currentTask: activity.task } : {}),
    })
  }

  buildResumeSnapshot(): ResumeSnapshot | null {
    if (!this.currentSession) {
      return null
    }

    const metadata = this.currentSession.metadata as Record<string, unknown>

    return {
      sessionId: this.currentSession.sessionId,
      workspaceId: this.currentSession.projectPath,
      branchName:
        typeof metadata.branchName === 'string' ? metadata.branchName : undefined,
      lastActiveAt: this.currentSession.lastActivity,
      recentFiles: [...this.currentSession.recentFiles],
      recentSymbols: [...this.currentSession.recentSymbols],
      recentTasks: [...this.currentSession.recentTasks],
      recentDecisions: [...this.currentSession.recentDecisions],
      changedFilesSinceLastSession: [...this.currentSession.recentFiles],
      suggestedResumeNotes: this.getResumeSuggestions(),
      checkpointId:
        typeof metadata.checkpointId === 'string'
          ? metadata.checkpointId
          : undefined,
    }
  }

  getChangedWorkSinceLastSession(): string[] {
    if (!this.currentSession) {
      return []
    }

    return [...this.currentSession.recentFiles]
  }

  getResumeSuggestions(): string[] {
    if (!this.currentSession) {
      return []
    }

    const suggestions: string[] = []

    if (this.currentSession.remainingTasks.length > 0) {
      suggestions.push(`Continue task: ${this.currentSession.remainingTasks[0]}`)
    }

    if (this.currentSession.recentDecisions.length > 0) {
      suggestions.push(
        `Recall last decision: ${this.currentSession.recentDecisions[0]}`,
      )
    }

    if (this.currentSession.recentFiles.length > 0) {
      suggestions.push(
        `Reopen file: ${this.currentSession.recentFiles[0]}`,
      )
    }

    return suggestions.slice(0, 3)
  }

  buildResumeContext(): string | null {
    const snapshot = this.buildResumeSnapshot()
    if (!snapshot) {
      return null
    }

    const sections = [
      `## Resume Snapshot`,
      `- Session: ${snapshot.sessionId}`,
      `- Workspace: ${snapshot.workspaceId}`,
    ]

    if (snapshot.recentTasks.length > 0) {
      sections.push(
        `- Recent tasks: ${snapshot.recentTasks.join(', ')}`,
      )
    }

    if (snapshot.recentFiles.length > 0) {
      sections.push(
        `- Recent files: ${snapshot.recentFiles.join(', ')}`,
      )
    }

    if (snapshot.recentSymbols.length > 0) {
      sections.push(
        `- Recent symbols: ${snapshot.recentSymbols.join(', ')}`,
      )
    }

    if (snapshot.recentDecisions.length > 0) {
      sections.push(
        `- Recent decisions: ${snapshot.recentDecisions.join(', ')}`,
      )
    }

    if (snapshot.suggestedResumeNotes && snapshot.suggestedResumeNotes.length > 0) {
      sections.push(
        `- Suggested next steps: ${snapshot.suggestedResumeNotes.join(' | ')}`,
      )
    }

    return sections.join('\n')
  }

  /**
   * End the current session
   */
  async endCurrentSession(status: SessionState['status'] = 'completed'): Promise<void> {
    if (!this.currentSession) return

    this.currentSession.status = status
    this.currentSession.lastActivity = Date.now()

    // Generate session summary
    const summary = await this.generateSessionSummary(this.currentSession)
    this.currentSession.conversationSummary = summary

    // Update in history
    const index = this.sessionHistory.sessions.findIndex(
      s => s.sessionId === this.currentSession!.sessionId
    )
    if (index !== -1) {
      this.sessionHistory.sessions[index] = this.currentSession
    }

    this.sessionHistory.currentSessionId = undefined

    // Add to memory
    const memorySystem = getMemorySystem()
    await memorySystem.addEntry({
      type: 'session',
      content: `Ended session: ${summary}`,
      sessionId: this.currentSession.sessionId,
      projectPath: this.currentSession.projectPath,
      metadata: {
        action: 'session_end',
        status,
        tasksCompleted: this.currentSession.completedTasks.length,
        tasksRemaining: this.currentSession.remainingTasks.length,
      },
      importance: 0.9,
    })

    await this.saveSessionHistory()
    await this.persistCurrentSession()
    logForDebugging(`[Session] Ended session: ${this.currentSession.sessionId}`)

    this.currentSession = null
  }

  /**
   * Get session history
   */
  getSessionHistory(limit?: number): SessionState[] {
    const sessions = [...this.sessionHistory.sessions].sort(
      (a, b) => b.lastActivity - a.lastActivity
    )
    return limit ? sessions.slice(0, limit) : sessions
  }

  /**
   * Resume a previous session
   */
  async resumeSession(sessionId: string): Promise<SessionState> {
    const session = this.sessionHistory.sessions.find(s => s.sessionId === sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // End current session first
    if (this.currentSession) {
      await this.endCurrentSession('paused')
    }

    // Resume the target session
    session.status = 'active'
    session.lastActivity = Date.now()
    this.currentSession = session
    this.sessionHistory.currentSessionId = sessionId

    // Add to memory
    const memorySystem = getMemorySystem()
    await memorySystem.addEntry({
      type: 'session',
      content: `Resumed session: ${session.conversationSummary || 'No summary available'}`,
      sessionId,
      projectPath: session.projectPath,
      metadata: { action: 'session_resume' },
      importance: 0.8,
    })

    await this.saveSessionHistory()
    await this.persistCurrentSession()
    logForDebugging(`[Session] Resumed session: ${sessionId}`)

    return session
  }

  /**
   * Generate session continuation prompt
   */
  async getSessionContinuationPrompt(): Promise<string | null> {
    if (!this.currentSession) return null

    const { completedTasks, remainingTasks, keyInsights, workingFiles, conversationSummary } = this.currentSession

    let prompt = `## Session Continuation\n\n`

    if (conversationSummary) {
      prompt += `**Previous Context:**\n${conversationSummary}\n\n`
    }

    if (completedTasks.length > 0) {
      prompt += `**Completed Tasks:**\n${completedTasks.map(t => `- ✅ ${t}`).join('\n')}\n\n`
    }

    if (remainingTasks.length > 0) {
      prompt += `**Remaining Tasks:**\n${remainingTasks.map(t => `- ⏳ ${t}`).join('\n')}\n\n`
    }

    if (keyInsights.length > 0) {
      prompt += `**Key Insights:**\n${keyInsights.map(i => `- 💡 ${i}`).join('\n')}\n\n`
    }

    if (workingFiles.length > 0) {
      prompt += `**Working Files:**\n${workingFiles.map(f => `- 📁 ${f}`).join('\n')}\n\n`
    }

    return prompt
  }

  private async loadSessionHistory(): Promise<void> {
    try {
      const filePath = join(this.config.sessionDir, 'history.json')
      const data = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(data)
      this.sessionHistory = sessionHistorySchema.parse(parsed)

      // Clean up expired sessions
      await this.cleanupExpiredSessions()
      await this.hydrateCurrentSessionFromCanonicalState()
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logForDebugging(`[Session] Failed to load history: ${error}`)
      }
      // Initialize empty history if file doesn't exist or is corrupt
      this.sessionHistory = {
        version: '1.0.0',
        sessions: [],
      }
    }
  }

  private async saveSessionHistory(): Promise<void> {
    try {
      const filePath = join(this.config.sessionDir, 'history.json')
      const data = JSON.stringify(this.sessionHistory, null, 2)

      await mkdir(this.config.sessionDir, { recursive: true })
      await writeFile(filePath, data, 'utf8')
    } catch (error) {
      logForDebugging(`[Session] Failed to save history: ${error}`)
    }
  }

  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => {
      this.saveSessionHistory().catch(error =>
        logForDebugging(`[Session] Auto-save failed: ${error}`)
      )
    }, this.config.autoSaveInterval)
  }

  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now()
    const beforeCount = this.sessionHistory.sessions.length

    this.sessionHistory.sessions = this.sessionHistory.sessions.filter(session => {
      const age = now - session.lastActivity
      return age < this.config.sessionTTL
    })

    // Limit total sessions
    if (this.sessionHistory.sessions.length > this.config.maxSessions) {
      this.sessionHistory.sessions.sort((a, b) => b.lastActivity - a.lastActivity)
      this.sessionHistory.sessions = this.sessionHistory.sessions.slice(0, this.config.maxSessions)
    }

    const afterCount = this.sessionHistory.sessions.length
    if (beforeCount !== afterCount) {
      logForDebugging(`[Session] Cleaned up expired sessions: ${beforeCount} → ${afterCount}`)
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private async hydrateCurrentSessionFromCanonicalState(): Promise<void> {
    const currentSessionId = this.sessionHistory.currentSessionId
    if (!currentSessionId) {
      return
    }

    const legacySession = this.sessionHistory.sessions.find(
      session => session.sessionId === currentSessionId,
    )
    const persisted = await loadPersistedSessionState(currentSessionId, {
      projectDir: legacySession?.projectPath,
    })
    if (persisted?.continuityMetadata) {
      this.currentSession = this.fromPersistedContinuity(
        persisted.continuityMetadata,
      )

      const existingIndex = this.sessionHistory.sessions.findIndex(
        session => session.sessionId === currentSessionId,
      )
      if (existingIndex !== -1) {
        this.sessionHistory.sessions[existingIndex] = this.currentSession
      } else {
        this.sessionHistory.sessions.push(this.currentSession)
      }
      return
    }

    if (legacySession) {
      this.currentSession = {
        ...legacySession,
        recentFiles: legacySession.workingFiles,
        recentSymbols: [],
        recentTasks: [],
        recentDecisions: [],
        metadata: {
          ...legacySession.metadata,
          legacySources: ['session-history'],
        },
      }
    }
  }

  private async persistCurrentSession(): Promise<void> {
    if (!this.currentSession) {
      return
    }
    await this.persistSession(this.currentSession)
  }

  private async persistSession(
    session: SessionState,
    legacySources: string[] = [],
  ): Promise<void> {
    const metadataLegacySources = Array.isArray(session.metadata?.legacySources)
      ? session.metadata.legacySources.filter(
          (source): source is string => typeof source === 'string',
        )
      : []

    await updatePersistedSessionContinuity(
      session.sessionId,
      {
        sessionId: session.sessionId,
        projectPath: session.projectPath,
        startedAt: session.startedAt,
        lastActivity: session.lastActivity,
        status: session.status,
        activePlan: session.activePlan,
        planName: session.planName,
        completedTasks: session.completedTasks,
        remainingTasks: session.remainingTasks,
        currentTask: session.currentTask,
        workingFiles: session.workingFiles,
        conversationSummary: session.conversationSummary,
        keyInsights: session.keyInsights,
        recentFiles: session.recentFiles,
        recentSymbols: session.recentSymbols,
        recentTasks: session.recentTasks,
        recentDecisions: session.recentDecisions,
        metadata: session.metadata,
      },
      {
        projectDir: session.projectPath,
        legacySources: [...metadataLegacySources, ...legacySources],
      },
    )
  }

  private fromPersistedContinuity(
    continuity: PersistedSessionContinuityMetadata,
  ): SessionState {
    return {
      sessionId: continuity.sessionId,
      projectPath: continuity.projectPath,
      startedAt: continuity.startedAt,
      lastActivity: continuity.lastActivity,
      status: continuity.status,
      activePlan: continuity.activePlan,
      planName: continuity.planName,
      completedTasks: continuity.completedTasks,
      remainingTasks: continuity.remainingTasks,
      currentTask: continuity.currentTask,
      workingFiles: continuity.workingFiles,
      conversationSummary: continuity.conversationSummary,
      keyInsights: continuity.keyInsights,
      recentFiles: continuity.recentFiles ?? continuity.workingFiles,
      recentSymbols: continuity.recentSymbols ?? [],
      recentTasks: continuity.recentTasks ?? [],
      recentDecisions: continuity.recentDecisions ?? [],
      metadata: continuity.metadata,
    }
  }

  private mergeRecentItems(existing: string[], incoming?: string[]): string[] {
    if (!incoming || incoming.length === 0) {
      return existing
    }

    return Array.from(new Set([...incoming, ...existing])).slice(0, 10)
  }

  private async generateSessionSummary(session: SessionState): Promise<string> {
    const duration = session.lastActivity - session.startedAt
    const durationHours = Math.round(duration / (1000 * 60 * 60) * 10) / 10

    let summary = `Session lasted ${durationHours}h in ${session.projectPath}. `

    if (session.completedTasks.length > 0) {
      summary += `Completed ${session.completedTasks.length} tasks. `
    }

    if (session.remainingTasks.length > 0) {
      summary += `${session.remainingTasks.length} tasks remaining. `
    }

    if (session.keyInsights.length > 0) {
      summary += `Gained ${session.keyInsights.length} insights. `
    }

    return summary.trim()
  }

  private async logSessionChanges(oldSession: SessionState, newSession: SessionState): Promise<void> {
    const memorySystem = getMemorySystem()

    // Log task completions
    const newCompletions = newSession.completedTasks.filter(
      task => !oldSession.completedTasks.includes(task)
    )

    for (const task of newCompletions) {
      await memorySystem.addEntry({
        type: 'task',
        content: `Task completed: ${task}`,
        sessionId: newSession.sessionId,
        projectPath: newSession.projectPath,
        metadata: { action: 'task_complete' },
        importance: 0.7,
      })
    }

    // Log new insights
    const newInsights = newSession.keyInsights.filter(
      insight => !oldSession.keyInsights.includes(insight)
    )

    for (const insight of newInsights) {
      await memorySystem.addEntry({
        type: 'insight',
        content: insight,
        sessionId: newSession.sessionId,
        projectPath: newSession.projectPath,
        importance: 0.8,
        tags: ['insight', 'session'],
      })
    }
  }
}

// Global instance
let globalSessionManager: SessionContinuityManager | null = null

/**
 * Get the global session continuity manager
 */
export function getSessionManager(config?: Partial<SessionContinuityConfig>): SessionContinuityManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionContinuityManager(config)
  }
  return globalSessionManager
}

/**
 * Initialize the global session manager
 */
export async function initializeSessionManager(config?: Partial<SessionContinuityConfig>): Promise<void> {
  const manager = getSessionManager(config)
  await manager.initialize()
}

export { SessionContinuityManager }
