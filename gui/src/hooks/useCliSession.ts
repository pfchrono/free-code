import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface CliMessage {
  type: string
  role?: 'user' | 'assistant'
  content?: string
  message?: string
  level?: 'info' | 'warning' | 'error'
  outputTokens?: number
  inputTokens?: number
  timestamp?: number
}

export interface SessionInfo {
  version: string
  model: string
  provider: string
  cwd: string
}

export function useCliSession() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [messages, setMessages] = useState<Array<{role: string, content: string, timestamp: number}>>([])
  const [status, setStatus] = useState<string>('Disconnected')
  const [error, setError] = useState<string | null>(null)

  const startSession = useCallback(async () => {
    try {
      setError(null)
      setStatus('Starting CLI...')
      
      const id = `session_${Date.now()}`
      await invoke('start_cli', { sessionId: id })
      
      setSessionId(id)
      setStatus('Connected')
      
      // Read initial events
      const events = await invoke<string[]>('read_cli_events', { sessionId: id, maxEvents: 10 })
      parseEvents(events, setSessionInfo, setMessages)
      
    } catch (err) {
      setError(String(err))
      setStatus('Error')
    }
  }, [])

  const sendCommand = useCallback(async (command: CliMessage) => {
    if (!sessionId) return

    try {
      await invoke('send_cli_command', {
        sessionId,
        command: JSON.stringify(command),
      })

      // Add user message immediately
      if (command.type === 'user_input' && command.content) {
        setMessages(prev => [...prev, {
          role: 'user',
          content: command.content || '',
          timestamp: Date.now(),
        }])
      }

      // Read response events
      const events = await invoke<string[]>('read_cli_events', { sessionId, maxEvents: 10 })
      parseEvents(events, setSessionInfo, setMessages)

    } catch (err) {
      setError(String(err))
    }
  }, [sessionId])

  const stopSession = useCallback(async () => {
    if (!sessionId) return

    try {
      await invoke('stop_cli', { sessionId })
      setSessionId(null)
      setStatus('Disconnected')
    } catch (err) {
      setError(String(err))
    }
  }, [sessionId])

  useEffect(() => {
    return () => {
      if (sessionId) {
        invoke('stop_cli', { sessionId }).catch(() => {})
      }
    }
  }, [sessionId])

  return {
    sessionId,
    sessionInfo,
    messages,
    status,
    error,
    startSession,
    sendCommand,
    stopSession,
  }
}

function parseEvents(
  events: string[],
  setSessionInfo: (info: SessionInfo | null) => void,
  setMessages: React.Dispatch<React.SetStateAction<Array<{role: string, content: string, timestamp: number}>>>,
) {
  for (const eventStr of events) {
    try {
      const event = JSON.parse(eventStr) as CliMessage

      switch (event.type) {
        case 'session_start':
          setSessionInfo({
            version: (event as any).version || 'unknown',
            model: (event as any).model || 'unknown',
            provider: (event as any).provider || 'unknown',
            cwd: (event as any).cwd || '',
          })
          break

        case 'message':
          if (event.role === 'user' || event.role === 'assistant') {
            setMessages(prev => [...prev, {
              role: event.role!,
              content: event.content || '',
              timestamp: event.timestamp || Date.now(),
            }])
          }
          break

        case 'status':
          // Status updates - could show in UI
          break

        case 'error':
          console.error('CLI Error:', event.message)
          break
      }
    } catch {
      // Skip malformed JSON
    }
  }
}
