/**
 * Enhanced Memory Command - Phase 1 Implementation
 * Integrates persistent memory system and session continuity
 */

import * as React from 'react'
import { useState, useEffect } from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text, Static, Newline } from '../../ink.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { getSessionId } from '../../bootstrap/state.js'
import { getMemorySystem, type MemoryEntry } from '../../services/memory/persistentMemorySystem.js'
import { getSessionManager } from '../../services/memory/sessionContinuityManager.js'
import { logForDebugging } from '../../utils/debug.js'
import { loadPersistedSessionState } from '../../utils/persistedSessionState.js'

interface MemoryCommandProps {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void
  args?: string
}

function MemoryCommand({ onDone, args }: MemoryCommandProps): React.ReactNode {
  const [mode, setMode] = useState<'menu' | 'search' | 'stats' | 'session'>('menu')
  const [searchResults, setSearchResults] = useState<MemoryEntry[]>([])
  const [persistedState, setPersistedState] = useState<Awaited<ReturnType<typeof loadPersistedSessionState>>>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>()

  const memorySystem = getMemorySystem()
  const sessionManager = getSessionManager()

  useEffect(() => {
    void loadPersistedSessionState(getSessionId()).then(setPersistedState).catch(error => {
      logForDebugging(`[Memory] Failed to load persisted session state: ${error}`)
    })
  }, [])

  useEffect(() => {
    // Parse command arguments
    if (args) {
      const trimmed = args.trim().toLowerCase()
      if (trimmed.startsWith('search ')) {
        const query = args.slice(7).trim()
        handleSearch(query)
      } else if (trimmed === 'stats') {
        setMode('stats')
      } else if (trimmed === 'session') {
        setMode('session')
      }
    }
  }, [args])

  const handleSearch = async (query: string) => {
    setIsLoading(true)
    setError(undefined)
    try {
      const results = await memorySystem.searchEntries(query, { limit: 20 })
      setSearchResults(results)
      setMode('search')
    } catch (err) {
      setError(`Search failed: ${err}`)
      logForDebugging(`[Memory] Search error: ${err}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    onDone('Memory command cancelled', { display: 'system' })
  }

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString()
  }

  const formatSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  if (isLoading) {
    return (
      <Dialog title="Memory System" onCancel={handleCancel} color="remember">
        <Text>Loading...</Text>
      </Dialog>
    )
  }

  if (error) {
    return (
      <Dialog title="Memory System" onCancel={handleCancel} color="remember">
        <Text color="red">Error: {error}</Text>
      </Dialog>
    )
  }

  if (mode === 'stats') {
    const stats = memorySystem.getStats()
    const currentSession = persistedState?.continuityMetadata ?? sessionManager.getCurrentSession()

    return (
      <Dialog title="Memory System Statistics" onCancel={handleCancel} color="remember">
        <Box flexDirection="column">
          <Text bold>Memory Store:</Text>
          <Text>  Entries: {stats.totalEntries}</Text>
          <Text>  Size: {formatSize(stats.totalSize)}</Text>
          <Text>  Last Access: {formatTimestamp(stats.lastAccess)}</Text>
          <Newline />

          <Text bold>Current Session:</Text>
          {currentSession ? (
            <>
              <Text>  ID: {currentSession.sessionId}</Text>
              <Text>  Project: {currentSession.projectPath}</Text>
              <Text>  Status: {currentSession.status}</Text>
              <Text>  Started: {formatTimestamp(currentSession.startedAt)}</Text>
              <Text>  Tasks Completed: {currentSession.completedTasks.length}</Text>
              <Text>  Tasks Remaining: {currentSession.remainingTasks.length}</Text>
              <Text>  Key Insights: {currentSession.keyInsights.length}</Text>
              <Text>  Working Files: {currentSession.workingFiles.length}</Text>
              <Text>  Source: persisted session state</Text>
            </>
          ) : (
            <Text dimColor>  No active session</Text>
          )}
        </Box>
      </Dialog>
    )
  }

  if (mode === 'session') {
    const currentSession = persistedState?.continuityMetadata ?? sessionManager.getCurrentSession()
    const recentSessions = sessionManager.getSessionHistory(5)

    return (
      <Dialog title="Session Management" onCancel={handleCancel} color="remember">
        <Box flexDirection="column">
          <Text bold>Current Session:</Text>
          {currentSession ? (
            <>
              <Text>  Project: {currentSession.projectPath}</Text>
              <Text>  Started: {formatTimestamp(currentSession.startedAt)}</Text>
              <Text>  Last Activity: {formatTimestamp(currentSession.lastActivity)}</Text>
              <Text>  Continuity Source: persisted session state</Text>
              <Newline />

              {currentSession.remainingTasks.length > 0 && (
                <>
                  <Text bold>Remaining Tasks:</Text>
                  {currentSession.remainingTasks.slice(0, 5).map((task, i) => (
                    <Text key={i}>  • {task}</Text>
                  ))}
                  {currentSession.remainingTasks.length > 5 && (
                    <Text dimColor>  ... and {currentSession.remainingTasks.length - 5} more</Text>
                  )}
                  <Newline />
                </>
              )}

              {currentSession.keyInsights.length > 0 && (
                <>
                  <Text bold>Key Insights:</Text>
                  {currentSession.keyInsights.slice(0, 3).map((insight, i) => (
                    <Text key={i}>  💡 {insight}</Text>
                  ))}
                  {currentSession.keyInsights.length > 3 && (
                    <Text dimColor>  ... and {currentSession.keyInsights.length - 3} more</Text>
                  )}
                  <Newline />
                </>
              )}
            </>
          ) : (
            <>
              <Text dimColor>  No active session</Text>
              <Newline />
            </>
          )}

          <Text bold>Recent Sessions:</Text>
          {recentSessions.length > 0 ? (
            recentSessions.map((session, i) => (
              <Text key={i} dimColor={session.sessionId === currentSession?.sessionId}>
                  {session.sessionId === currentSession?.sessionId ? '→ ' : '  '}
                  {session.projectPath} ({session.status})
              </Text>
            ))
          ) : (
            <Text dimColor>  No session history</Text>
          )}
        </Box>
      </Dialog>
    )
  }

  if (mode === 'search' && searchResults.length > 0) {
    return (
      <Dialog title={`Memory Search Results (${searchResults.length})`} onCancel={handleCancel} color="remember">
        <Box flexDirection="column">
          {searchResults.map((entry, i) => (
            <Box key={entry.id} flexDirection="column" marginBottom={1}>
              <Box>
                <Text bold color="blue">[{entry.type}]</Text>
                <Text dimColor> {formatTimestamp(entry.timestamp)}</Text>
                {entry.importance !== undefined && (
                  <Text color="yellow"> (★{(entry.importance * 5).toFixed(1)})</Text>
                )}
              </Box>
              <Text>{entry.content.slice(0, 200)}{entry.content.length > 200 ? '...' : ''}</Text>
              {entry.tags && entry.tags.length > 0 && (
                <Text dimColor>Tags: {entry.tags.join(', ')}</Text>
              )}
              {i < searchResults.length - 1 && <Text>{'─'.repeat(60)}</Text>}
            </Box>
          ))}
        </Box>
      </Dialog>
    )
  }

  // Main menu
  return (
    <Dialog title="Enhanced Memory System" onCancel={handleCancel} color="remember">
      <Box flexDirection="column">
        <Text>Available commands:</Text>
        <Newline />
        <Text>  /memory search &lt;query&gt;  - Search memory entries</Text>
        <Text>  /memory stats           - View system statistics</Text>
        <Text>  /memory session         - View session information</Text>
        <Newline />
        <Text bold>Recent Entries:</Text>
        <RecentMemoryEntries />
        <Newline />
        <Text dimColor>
          Enhanced memory system with persistent storage and session continuity.
        </Text>
      </Box>
    </Dialog>
  )
}

function RecentMemoryEntries(): React.ReactNode {
  const [entries, setEntries] = useState<MemoryEntry[]>([])

  useEffect(() => {
    const loadRecentEntries = async () => {
      try {
        const memorySystem = getMemorySystem()
        const recent = await memorySystem.getEntries({ limit: 5 })
        setEntries(recent)
      } catch (error) {
        logForDebugging(`[Memory] Failed to load recent entries: ${error}`)
      }
    }

    loadRecentEntries()
  }, [])

  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60 * 1000) return 'just now'
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`
  }

  return (
    <Box flexDirection="column">
      {entries.length > 0 ? (
        entries.map((entry) => (
          <Text key={entry.id} dimColor>
            • [{entry.type}] {entry.content.slice(0, 50)}... ({formatTimestamp(entry.timestamp)})
          </Text>
        ))
      ) : (
        <Text dimColor>No recent entries</Text>
      )}
    </Box>
  )
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  // Initialize memory systems if needed
  try {
    const memorySystem = getMemorySystem()
    const sessionManager = getSessionManager()

    // Ensure systems are initialized
    await memorySystem.initialize?.()
    await sessionManager.initialize?.()
  } catch (error) {
    logForDebugging(`[Memory] Initialization error: ${error}`)
  }

  return <MemoryCommand onDone={onDone} args={args} />
}
