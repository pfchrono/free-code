import * as React from 'react'
import { useEffect, useState } from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Newline, Text } from '../../ink.js'
import { getMemorySystem, type MemoryEntry, type MemoryRecallExplanation } from '../../services/memory/persistentMemorySystem.js'
import { getSessionManager, type ResumeSnapshot } from '../../services/memory/sessionContinuityManager.js'
import { ArchivistCheckpointProvider, type CheckpointSummary } from '../../services/providers/archivist/archivistCheckpointProvider.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { logForDebugging } from '../../utils/debug.js'
import { loadPersistedSessionState } from '../../utils/persistedSessionState.js'

type MemoryView = 'menu' | 'search' | 'recent' | 'project' | 'checkpoints' | 'resume' | 'stats'

interface MemoryCommandProps {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void
  args?: string
}

interface MemoryCommandData {
  mode: MemoryView
  title: string
  searchResults: MemoryEntry[]
  recentResults: MemoryEntry[]
  projectResults: MemoryEntry[]
  recallExplanations: MemoryRecallExplanation[]
  checkpoints: CheckpointSummary[]
  resumeSnapshot: ResumeSnapshot | null
  resumeContext: string | null
}

function createEmptyData(): MemoryCommandData {
  return {
    mode: 'menu',
    title: 'Memory',
    searchResults: [],
    recentResults: [],
    projectResults: [],
    recallExplanations: [],
    checkpoints: [],
    resumeSnapshot: null,
    resumeContext: null,
  }
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

async function loadMemoryCommandData(args?: string): Promise<MemoryCommandData> {
  const memorySystem = getMemorySystem()
  const sessionManager = getSessionManager()
  const currentSessionId = getSessionId()
  const projectPath = getOriginalCwd()
  const trimmedArgs = args?.trim() ?? ''
  const command = trimmedArgs.toLowerCase()
  const checkpointProvider = new ArchivistCheckpointProvider()

  if (!trimmedArgs || command === 'recent') {
    return {
      ...createEmptyData(),
      mode: 'recent',
      title: 'Recent Memory',
      recentResults: await memorySystem.getEntries({ limit: 8, projectPath }),
    }
  }

  if (command.startsWith('search ')) {
    const query = trimmedArgs.slice(7).trim()
    return {
      ...createEmptyData(),
      mode: 'search',
      title: `Memory Search: ${query}`,
      searchResults: await memorySystem.searchEntries(query, { limit: 10 }),
      recallExplanations: await memorySystem.explainRecall({
        query,
        projectPath,
        sessionId: currentSessionId,
        limit: 5,
      }),
    }
  }

  if (command.startsWith('save ')) {
    const note = trimmedArgs.slice(5).trim()
    await memorySystem.saveProjectMemory({
      content: note,
      projectPath,
      sessionId: currentSessionId,
      source: 'manual',
      summary: note.length > 120 ? `${note.slice(0, 117)}...` : note,
      importance: 0.7,
      metadata: { action: 'memory_save_command' },
    })

    return {
      ...createEmptyData(),
      mode: 'recent',
      title: 'Memory Saved',
      recentResults: await memorySystem.getEntries({ limit: 8, projectPath }),
    }
  }

  if (command === 'project') {
    return {
      ...createEmptyData(),
      mode: 'project',
      title: 'Project Memory',
      projectResults: await memorySystem.getRecentRelevantMemory({
        projectPath,
        sessionId: currentSessionId,
        limit: 8,
      }),
    }
  }

  if (command === 'checkpoints') {
    return {
      ...createEmptyData(),
      mode: 'checkpoints',
      title: 'Checkpoint Hints',
      checkpoints: checkpointProvider.isAvailable() ? await checkpointProvider.list(8) : [],
    }
  }

  if (command === 'resume' || command === 'session') {
    return {
      ...createEmptyData(),
      mode: 'resume',
      title: 'Resume Snapshot',
      resumeSnapshot: sessionManager.buildResumeSnapshot(),
      resumeContext: sessionManager.buildResumeContext(),
      projectResults: await memorySystem.getRecentRelevantMemory({
        projectPath,
        sessionId: currentSessionId,
        limit: 5,
      }),
    }
  }

  if (command === 'stats') {
    return {
      ...createEmptyData(),
      mode: 'stats',
      title: 'Memory Stats',
      resumeSnapshot: sessionManager.buildResumeSnapshot(),
    }
  }

  return createEmptyData()
}

function MemoryCommand({ onDone, args }: MemoryCommandProps): React.ReactNode {
  const [data, setData] = useState<MemoryCommandData>(createEmptyData())
  const [persistedState, setPersistedState] = useState<Awaited<ReturnType<typeof loadPersistedSessionState>>>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>()

  const memorySystem = getMemorySystem()
  const sessionManager = getSessionManager()

  useEffect(() => {
    void loadPersistedSessionState(getSessionId())
      .then(setPersistedState)
      .catch(error => {
        logForDebugging(`[Memory] Failed to load persisted session state: ${String(error)}`)
      })
  }, [])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(undefined)
      try {
        setData(await loadMemoryCommandData(args))
      } catch (error) {
        const message = String(error)
        setError(`Memory command failed: ${message}`)
        logForDebugging(`[Memory] Command load error: ${message}`)
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [args])

  const handleCancel = () => {
    onDone('Memory command cancelled', { display: 'system' })
  }

  if (isLoading) {
    return (
      <Dialog title="Memory" onCancel={handleCancel} color="remember">
        <Text>Loading memory…</Text>
      </Dialog>
    )
  }

  if (error) {
    return (
      <Dialog title="Memory" onCancel={handleCancel} color="remember">
        <Text color="red">{error}</Text>
      </Dialog>
    )
  }

  if (data.mode === 'stats') {
    const stats = memorySystem.getStats()
    const currentSession = persistedState?.continuityMetadata ?? sessionManager.getCurrentSession()

    return (
      <Dialog title={data.title} onCancel={handleCancel} color="remember">
        <Box flexDirection="column">
          <Text bold>Memory Store</Text>
          <Text>  Entries: {stats.totalEntries}</Text>
          <Text>  Size: {formatSize(stats.totalSize)}</Text>
          <Text>  Last Access: {formatTimestamp(stats.lastAccess)}</Text>
          <Newline />
          <Text bold>Session</Text>
          {currentSession ? (
            <>
              <Text>  ID: {currentSession.sessionId}</Text>
              <Text>  Project: {currentSession.projectPath}</Text>
              <Text>  Status: {currentSession.status}</Text>
              <Text>  Started: {formatTimestamp(currentSession.startedAt)}</Text>
              <Text>  Remaining Tasks: {currentSession.remainingTasks.length}</Text>
              <Text>  Recent Files: {currentSession.recentFiles.length}</Text>
            </>
          ) : (
            <Text dimColor>  No active session</Text>
          )}
        </Box>
      </Dialog>
    )
  }

  if (data.mode === 'resume') {
    return (
      <Dialog title={data.title} onCancel={handleCancel} color="remember">
        <Box flexDirection="column">
          {data.resumeSnapshot ? (
            <>
              <Text bold>Live Continuity</Text>
              <Text>  Last Active: {formatTimestamp(data.resumeSnapshot.lastActiveAt)}</Text>
              {data.resumeSnapshot.recentTasks.map(task => (
                <Text key={task}>  • Task: {task}</Text>
              ))}
              {data.resumeSnapshot.recentFiles.map(file => (
                <Text key={file}>  • File: {file}</Text>
              ))}
              {data.resumeSnapshot.recentDecisions.map(decision => (
                <Text key={decision}>  • Decision: {decision}</Text>
              ))}
              {data.resumeSnapshot.suggestedResumeNotes?.map(note => (
                <Text key={note} color="yellow">  → {note}</Text>
              ))}
              <Newline />
            </>
          ) : (
            <Text dimColor>No active continuity snapshot</Text>
          )}
          {data.resumeContext && (
            <>
              <Text bold>Resume Context</Text>
              {data.resumeContext.split('\n').map((line, index) => (
                <Text key={`${index}:${line}`}>{line}</Text>
              ))}
              <Newline />
            </>
          )}
          <Text bold>Relevant Memory</Text>
          <MemoryEntryList entries={data.projectResults} emptyLabel="No recent relevant memory" />
        </Box>
      </Dialog>
    )
  }

  if (data.mode === 'checkpoints') {
    return (
      <Dialog title={data.title} onCancel={handleCancel} color="remember">
        <Box flexDirection="column">
          {data.checkpoints.length > 0 ? data.checkpoints.map(checkpoint => (
            <Box key={checkpoint.id} flexDirection="column" marginBottom={1}>
              <Text bold>{checkpoint.label}</Text>
              <Text dimColor>  {checkpoint.id} · {formatTimestamp(checkpoint.createdAt)}</Text>
              {checkpoint.branchRef ? <Text dimColor>  Branch: {checkpoint.branchRef}</Text> : null}
              {checkpoint.note ? <Text dimColor>  {checkpoint.note}</Text> : null}
            </Box>
          )) : (
            <Text dimColor>Token-savior checkpoints unavailable.</Text>
          )}
        </Box>
      </Dialog>
    )
  }

  if (data.mode === 'project') {
    return (
      <Dialog title={data.title} onCancel={handleCancel} color="remember">
        <Box flexDirection="column">
          <MemoryEntryList entries={data.projectResults} emptyLabel="No project memory yet" />
        </Box>
      </Dialog>
    )
  }

  if (data.mode === 'search') {
    return (
      <Dialog title={data.title} onCancel={handleCancel} color="remember">
        <Box flexDirection="column">
          <MemoryEntryList entries={data.searchResults} emptyLabel="No memory matches" />
          <Newline />
          <Text bold>Why these showed up</Text>
          {data.recallExplanations.length > 0 ? data.recallExplanations.map((explanation, index) => (
            <Text key={`${explanation.entry.id}:${index}`} dimColor>
              • {explanation.entry.id}: {explanation.reasons.join(', ')}
            </Text>
          )) : <Text dimColor>No recall explanation available</Text>}
        </Box>
      </Dialog>
    )
  }

  return (
    <Dialog title={data.title} onCancel={handleCancel} color="remember">
      <Box flexDirection="column">
        <Text bold>Commands</Text>
        <Text>  /memory recent</Text>
        <Text>  /memory search &lt;query&gt;</Text>
        <Text>  /memory save &lt;note&gt;</Text>
        <Text>  /memory project</Text>
        <Text>  /memory checkpoints</Text>
        <Text>  /memory resume</Text>
        <Text>  /memory stats</Text>
        <Newline />
        <Text bold>Recent Memory</Text>
        <MemoryEntryList entries={data.recentResults} emptyLabel="No recent memory" />
      </Box>
    </Dialog>
  )
}

function MemoryEntryList({ entries, emptyLabel }: { entries: MemoryEntry[]; emptyLabel: string }): React.ReactNode {
  if (entries.length === 0) {
    return <Text dimColor>{emptyLabel}</Text>
  }

  return (
    <Box flexDirection="column">
      {entries.map(entry => (
        <Box key={entry.id} flexDirection="column" marginBottom={1}>
          <Text>
            <Text bold color="blue">[{entry.type}]</Text>
            <Text dimColor> {formatRelativeTime(entry.timestamp)}</Text>
            {entry.importance !== undefined ? <Text color="yellow"> ★{(entry.importance * 5).toFixed(1)}</Text> : null}
          </Text>
          <Text>{entry.content.slice(0, 220)}{entry.content.length > 220 ? '...' : ''}</Text>
          {entry.tags?.length ? <Text dimColor>Tags: {entry.tags.join(', ')}</Text> : null}
        </Box>
      ))}
    </Box>
  )
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  return <MemoryCommand onDone={onDone} args={args} />
}
