import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface CliMessage {
  type: string
  role?: 'user' | 'assistant' | 'system'
  content?: string
  message?: string
  level?: 'info' | 'warning' | 'error'
  outputTokens?: number
  inputTokens?: number
  durationMs?: number
  timestamp?: number
  tool?: string
  input?: Record<string, unknown>
  output?: string
  success?: boolean
  outcome?: 'success' | 'error' | 'cancelled'
  state?: 'idle' | 'running' | 'interrupting' | 'cancelled'
  commands?: Array<{
    name: string
    description: string
    aliases?: string[]
  }>
  version?: string
  model?: string
  provider?: string
  cwd?: string
}

export interface SessionInfo {
  version: string
  model: string
  provider: string
  cwd: string
}

export interface ConversationEvent {
  type: string
  role?: string
  content?: string
  message?: string
  level?: 'info' | 'warning' | 'error'
  tool?: string
  input?: Record<string, unknown>
  output?: string
  success?: boolean
  outputTokens?: number
  inputTokens?: number
  durationMs?: number
  timestamp: number
  id: string
}

export interface SlashCommand {
  name: string
  description: string
  aliases?: string[]
}

export type TurnState = 'idle' | 'running' | 'interrupting' | 'cancelled'

export function useCliSession() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [events, setEvents] = useState<ConversationEvent[]>([])
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const [status, setStatus] = useState<string>('Disconnected')
  const [error, setError] = useState<string | null>(null)
  const [turnState, setTurnState] = useState<TurnState>('idle')

  const startSession = useCallback(async () => {
    try {
      setError(null)
      setStatus('Starting CLI...')
      
      const id = `session_${Date.now()}`
      await invoke('start_cli', { sessionId: id })
      
      setSessionId(id)
      setStatus('Connected')
      setTurnState('idle')

      // Read initial events
      const events = await invoke<string[]>('read_cli_events', { sessionId: id, maxEvents: 20 })
      parseEvents(events, setSessionInfo, setEvents, setCommands, setStatus, setError, setTurnState)
      await requestCommands(id, setCommands, setSessionInfo, setEvents, setStatus, setError, setTurnState)
      
    } catch (err) {
      setError(String(err))
      setStatus('Error')
    }
  }, [])

  const sendCommand = useCallback(async (command: CliMessage) => {
    if (!sessionId) return

    try {
      if (command.type === 'user_input' && command.content) {
        setTurnState('running')
      } else if (command.type === 'interrupt') {
        setTurnState('interrupting')
        setStatus('Stopping current turn...')
      }

      await invoke('send_cli_command', {
        sessionId,
        command: JSON.stringify(command),
      })

      if (command.type === 'interrupt') {
        setStatus('Stopping current turn...')
        return
      }

      await drainEventsUntilTurnSettles(
        sessionId,
        setSessionInfo,
        setEvents,
        setCommands,
        setStatus,
        setError,
        setTurnState,
        'running',
      )

    } catch (err) {
      setError(String(err))
      setTurnState('idle')
    }
  }, [sessionId])

  const stopSession = useCallback(async () => {
    if (!sessionId) return

    try {
      await invoke('stop_cli', { sessionId })
      setSessionId(null)
      setStatus('Disconnected')
      setTurnState('idle')
    } catch (err) {
      setError(String(err))
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) {
      return
    }

    const stopCurrentSession = () => {
      invoke('stop_cli', { sessionId }).catch(() => {})
    }

    window.addEventListener('beforeunload', stopCurrentSession)

    return () => {
      window.removeEventListener('beforeunload', stopCurrentSession)
      stopCurrentSession()
    }
  }, [sessionId])

  return {
    sessionId,
    sessionInfo,
    events,
    commands,
    status,
    error,
    turnState,
    startSession,
    sendCommand,
    stopSession,
  }
}

async function requestCommands(
  sessionId: string,
  setCommands: React.Dispatch<React.SetStateAction<SlashCommand[]>>,
  setSessionInfo: (info: SessionInfo | null) => void,
  setEvents: React.Dispatch<React.SetStateAction<ConversationEvent[]>>,
  setStatus: React.Dispatch<React.SetStateAction<string>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  setTurnState: React.Dispatch<React.SetStateAction<TurnState>>,
) {
  await invoke('send_cli_command', {
    sessionId,
    command: JSON.stringify({ type: 'get_commands' }),
  })

  const commandEvents = await invoke<string[]>('read_cli_events', { sessionId, maxEvents: 20 })
  parseEvents(commandEvents, setSessionInfo, setEvents, setCommands, setStatus, setError, setTurnState)
}

async function drainEventsUntilTurnSettles(
  sessionId: string,
  setSessionInfo: (info: SessionInfo | null) => void,
  setEvents: React.Dispatch<React.SetStateAction<ConversationEvent[]>>,
  setCommands: React.Dispatch<React.SetStateAction<SlashCommand[]>>,
  setStatus: React.Dispatch<React.SetStateAction<string>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  setTurnState: React.Dispatch<React.SetStateAction<TurnState>>,
  initialTurnState: TurnState = 'running',
) {
  let currentTurnState: TurnState = initialTurnState

  while (true) {
    const polledEvents = await invoke<string[]>('read_cli_events', { sessionId, maxEvents: 50 })
    currentTurnState = parseEvents(
      polledEvents,
      setSessionInfo,
      setEvents,
      setCommands,
      setStatus,
      setError,
      setTurnState,
      currentTurnState,
    )

    if (currentTurnState === 'idle' || currentTurnState === 'cancelled') {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

export function parseEvents(
  events: string[],
  setSessionInfo: (info: SessionInfo | null) => void,
  setEvents: React.Dispatch<React.SetStateAction<ConversationEvent[]>>,
  setCommands: React.Dispatch<React.SetStateAction<SlashCommand[]>>,
  setStatus: React.Dispatch<React.SetStateAction<string>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  setTurnState: React.Dispatch<React.SetStateAction<TurnState>>,
  currentTurnState: TurnState = 'idle',
) {
  const parsedEvents: ConversationEvent[] = []
  let nextTurnState = currentTurnState

  for (const eventStr of events) {
    try {
      const event = JSON.parse(eventStr) as CliMessage

      switch (event.type) {
        case 'session_start':
          setSessionInfo({
            version: event.version || 'unknown',
            model: event.model || 'unknown',
            provider: event.provider || 'unknown',
            cwd: event.cwd || '',
          })
          break

        case 'message':
          if (event.role === 'user' || event.role === 'assistant') {
            parsedEvents.push({
              type: 'message',
              role: event.role,
              content: event.content || '',
              timestamp: event.timestamp || Date.now(),
              id: makeEventId(event),
            })
          }
          break

        case 'tool_use':
        case 'completion':
        case 'status':
        case 'error':
        case 'tool_result':
          parsedEvents.push({
            type: event.type,
            role: 'system',
            content: event.content,
            message: event.message,
            level: event.level,
            tool: event.tool,
            input: event.input,
            output: event.output,
            success: event.success,
            outputTokens: event.outputTokens,
            inputTokens: event.inputTokens,
            durationMs: event.durationMs,
            timestamp: event.timestamp || Date.now(),
            id: makeEventId(event),
          })

          if (event.type === 'status' && event.message) {
            setStatus(event.message)
          }

          if (event.type === 'error' && event.message) {
            setError(event.message)
          }
          break

        case 'commands_list':
          setCommands(event.commands || [])
          break

        case 'turn_state':
          if (
            event.state === 'idle' ||
            event.state === 'running' ||
            event.state === 'interrupting' ||
            event.state === 'cancelled'
          ) {
            nextTurnState = event.state
            setTurnState(event.state)
            if (event.state === 'idle') {
              setStatus('Connected')
            } else if (event.state === 'cancelled') {
              setStatus('Turn cancelled')
            }
          }
          break
      }
    } catch {
      // Skip malformed JSON
    }
  }

  if (parsedEvents.length > 0) {
    setEvents(prev => mergeEvents(prev, parsedEvents))
  }

  return nextTurnState
}

export function mergeEvents(previous: ConversationEvent[], incoming: ConversationEvent[]) {
  const merged = [...previous]
  const knownIds = new Set(previous.map((event) => event.id))

  for (const event of incoming) {
    if (knownIds.has(event.id)) {
      continue
    }

    merged.push(event)
    knownIds.add(event.id)
  }

  return merged.sort((a, b) => a.timestamp - b.timestamp)
}

function makeEventId(event: CliMessage & { timestamp?: number }) {
  const parts = [
    event.type,
    event.role || '',
    event.tool || '',
    event.timestamp || 0,
    event.content || '',
    event.message || '',
    event.output || '',
  ]

  return parts.join('::')
}
