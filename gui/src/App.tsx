import { useState, useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useCliSession } from './hooks/useCliSession'

function App() {
  const {
    sessionInfo,
    events,
    commands,
    status,
    error,
    turnState,
    startSession,
    sendCommand,
  } = useCliSession()

  const [input, setInput] = useState('')
  const [started, setStarted] = useState(false)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const commandPaletteCommands = useMemo(
    () => filterCommands(commands, input),
    [commands, input],
  )
  const conversationEvents = useMemo(
    () => events.filter((event) => event.type !== 'status' && event.type !== 'completion'),
    [events],
  )

  // Auto-start CLI on mount
  useEffect(() => {
    if (!started) {
      setStarted(true)
      startSession()
    }
  }, [started, startSession])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversationEvents])

  useEffect(() => {
    setSelectedCommandIndex(0)
  }, [input])

  const handleSendMessage = (content = input) => {
    if (!content.trim() || !sessionInfo || isRunning) return

    sendCommand({
      type: 'user_input',
      content,
    })
    setInput('')
  }

  const handleStop = () => {
    if (!sessionInfo || !isRunning) return

    sendCommand({
      type: 'interrupt',
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCommandPalette && e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedCommandIndex((current) =>
        Math.min(current + 1, Math.max(commandPaletteCommands.length - 1, 0)),
      )
      return
    }

    if (showCommandPalette && e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedCommandIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (showCommandPalette && e.key === 'Enter' && commandPaletteCommands[selectedCommandIndex]) {
      e.preventDefault()
      handleSendMessage(`/${commandPaletteCommands[selectedCommandIndex].name}`)
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const isRunning = turnState === 'running' || turnState === 'interrupting'
  const isInterrupting = turnState === 'interrupting'
  const wasCancelled = turnState === 'cancelled'
  const showCommandPalette = !isRunning && input.startsWith('/') && commandPaletteCommands.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui', background: '#1a1a1a' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', background: '#252525', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Free-Code GUI</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {sessionInfo ? `${sessionInfo.model} via ${sessionInfo.provider}` : 'Starting CLI...'}
            </div>
          </div>
        </div>
      </div>

      {/* Conversation */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {conversationEvents.length === 0 && (
          <div style={{ color: '#666', textAlign: 'center', marginTop: '40%' }}>
            {sessionInfo ? 'Type a message to start...' : 'Connecting to CLI...'}
          </div>
        )}
        {buildTranscriptEntries(conversationEvents).map((entry) => {
          const isUser = entry.role === 'user'
          const isAssistant = entry.role === 'assistant'
          const cardStyle: CSSProperties = {
            marginLeft: isUser ? '20%' : '0',
            marginRight: isAssistant ? '20%' : '0',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #333',
            background: isUser ? '#1f344d' : isAssistant ? '#222' : '#1c1c1c',
          }

          return (
            <div key={entry.id} style={cardStyle}>
              <div style={{ fontWeight: 600, color: isUser ? '#7db7ff' : isAssistant ? '#fff' : '#f5c16c', marginBottom: '6px' }}>
                {entry.label}
              </div>
              {entry.content && (
                <div style={{ whiteSpace: 'pre-wrap', color: '#ddd' }}>{entry.content}</div>
              )}
              {entry.tools.length > 0 && (
                <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                  {entry.tools.map((toolEvent) => (
                    <div key={toolEvent.id} style={toolCardStyle}>
                      <div style={{ color: '#9cdcfe', fontSize: '13px', fontWeight: 600 }}>
                        <code>{toolEvent.tool || toolEvent.type}</code>
                      </div>
                      {toolEvent.input && (
                        <pre style={detailStyle}>{JSON.stringify(toolEvent.input, null, 2)}</pre>
                      )}
                      {toolEvent.output && (
                        <pre style={detailStyle}>{toolEvent.output}</pre>
                      )}
                      {toolEvent.message && (
                        <div style={{ whiteSpace: 'pre-wrap', color: toolEvent.level === 'error' ? '#ff8b8b' : '#cfcfcf', marginTop: '6px' }}>{toolEvent.message}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Status */}
      {error && (
        <div style={{ padding: '8px 16px', fontSize: '12px', color: '#ff6b6b', borderTop: '1px solid #333', background: '#2a1a1a' }}>
          Error: {error}
        </div>
      )}
      {status && !error && (
        <div style={{ padding: '8px 16px', fontSize: '12px', color: '#888', borderTop: '1px solid #333' }}>
          {status}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '16px', borderTop: '1px solid #333', background: '#252525', position: 'relative' }}>
        {showCommandPalette && (
          <div style={commandPaletteStyle}>
            {commandPaletteCommands.map((command, index) => (
              <button
                key={command.name}
                type="button"
                onClick={() => handleSendMessage(`/${command.name}`)}
                style={{
                  ...commandPaletteItemStyle,
                  background: index === selectedCommandIndex ? '#2d4d73' : 'transparent',
                }}
              >
                <div style={{ color: '#7db7ff', fontWeight: 600 }}>/
                  {command.name}
                </div>
                <div style={{ color: '#cfcfcf', fontSize: '13px' }}>{command.description}</div>
                {command.aliases && command.aliases.length > 0 && (
                  <div style={{ color: '#888', fontSize: '12px' }}>
                    {command.aliases.map((alias) => `/${alias}`).join(', ')}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !sessionInfo
                ? 'Connecting...'
                : isRunning
                  ? 'Wait for the current turn to finish...'
                  : wasCancelled
                    ? 'Turn cancelled. Type a message or /command...'
                    : 'Type a message or /command...'
            }
            disabled={!sessionInfo || isRunning}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #333',
              background: sessionInfo && !isRunning ? '#2a2a2a' : '#1a1a1a',
              color: sessionInfo && !isRunning ? '#fff' : '#666',
              fontSize: '14px',
              cursor: sessionInfo && !isRunning ? 'text' : 'not-allowed',
            }}
          />
          {isRunning ? (
            <button
              onClick={handleStop}
              disabled={!sessionInfo || isInterrupting}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                background: isInterrupting ? '#555' : '#ff6b6b',
                color: '#fff',
                fontSize: '14px',
                cursor: sessionInfo && !isInterrupting ? 'pointer' : 'not-allowed',
                opacity: sessionInfo && !isInterrupting ? 1 : 0.6,
              }}
            >
              {isInterrupting ? 'Stopping…' : 'Stop'}
            </button>
          ) : (
            <button
              onClick={() => handleSendMessage()}
              disabled={!sessionInfo || !input.trim()}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                background: sessionInfo ? '#4a9eff' : '#333',
                color: '#fff',
                fontSize: '14px',
                cursor: sessionInfo && input.trim() ? 'pointer' : 'not-allowed',
                opacity: sessionInfo && input.trim() ? 1 : 0.5,
              }}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const detailStyle: CSSProperties = {
  marginTop: '8px',
  marginBottom: 0,
  padding: '10px',
  borderRadius: '6px',
  background: '#111',
  border: '1px solid #2e2e2e',
  color: '#cfcfcf',
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
  overflowX: 'auto',
}

const toolCardStyle: CSSProperties = {
  padding: '10px',
  borderRadius: '6px',
  background: '#161616',
  border: '1px solid #2e2e2e',
}

const commandPaletteStyle: CSSProperties = {
  position: 'absolute',
  left: '16px',
  right: '96px',
  bottom: '64px',
  borderRadius: '8px',
  border: '1px solid #333',
  background: '#1c1c1c',
  boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.35)',
  overflow: 'hidden',
}

const commandPaletteItemStyle: CSSProperties = {
  width: '100%',
  border: 'none',
  textAlign: 'left',
  padding: '10px 12px',
  display: 'grid',
  gap: '4px',
  cursor: 'pointer',
}

function filterCommands(commands: { name: string; description: string; aliases?: string[] }[], input: string) {
  const normalizedInput = input.startsWith('/') ? input.slice(1).toLowerCase() : ''

  if (!normalizedInput) {
    return commands.slice(0, 8)
  }

  return commands
    .filter((command) => {
      const aliases = command.aliases || []
      return command.name.toLowerCase().includes(normalizedInput)
        || command.description.toLowerCase().includes(normalizedInput)
        || aliases.some((alias) => alias.toLowerCase().includes(normalizedInput))
    })
    .slice(0, 8)
}

type TranscriptEntry = {
  id: string
  role: 'user' | 'assistant' | 'system'
  label: string
  content?: string
  tools: Array<{
    id: string
    type: string
    tool?: string
    input?: Record<string, unknown>
    output?: string
    message?: string
    level?: 'info' | 'warning' | 'error'
  }>
}

function buildTranscriptEntries(events: ReturnType<typeof useCliSession>['events']): TranscriptEntry[] {
  const entries: TranscriptEntry[] = []
  let currentAssistantEntry: TranscriptEntry | undefined

  for (const event of events) {
    if (event.type === 'message' && event.role === 'assistant') {
      currentAssistantEntry = {
        id: event.id,
        role: 'assistant',
        label: 'Assistant',
        content: event.content,
        tools: [],
      }
      entries.push(currentAssistantEntry)
      continue
    }

    if (event.type === 'message' && event.role === 'user') {
      currentAssistantEntry = undefined
      entries.push({
        id: event.id,
        role: 'user',
        label: 'You',
        content: event.content,
        tools: [],
      })
      continue
    }

    if (event.type === 'tool_use' || event.type === 'tool_result') {
      if (currentAssistantEntry) {
        currentAssistantEntry.tools.push({
          id: event.id,
          type: event.type,
          tool: event.tool,
          input: event.input,
          output: event.output,
          message: event.message,
          level: event.level,
        })
        continue
      }
    } else {
      currentAssistantEntry = undefined
    }

    entries.push({
      id: event.id,
      role: 'system',
      label: labelForEvent(event.type, event.role),
      content: event.content || event.message,
      tools: event.tool || event.input || event.output ? [{
        id: event.id,
        type: event.type,
        tool: event.tool,
        input: event.input,
        output: event.output,
        message: event.message,
        level: event.level,
      }] : [],
    })
  }

  return entries
}

function labelForEvent(type: string, role?: string) {
  if (type === 'message') {
    if (role === 'user') return 'You'
    if (role === 'assistant') return 'Assistant'
  }

  if (type === 'tool_use') return 'Tool use'
  if (type === 'tool_result') return 'Tool result'
  if (type === 'completion') return 'Completion'
  if (type === 'status') return 'Status'
  if (type === 'error') return 'Error'

  return type
}

export default App
