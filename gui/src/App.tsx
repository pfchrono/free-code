import { useState, useEffect, useRef } from 'react'
import { useCliSession } from './hooks/useCliSession'

function App() {
  const {
    sessionInfo,
    messages,
    status,
    error,
    startSession,
    sendCommand,
  } = useCliSession()

  const [input, setInput] = useState('')
  const [started, setStarted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-start CLI on mount
  useEffect(() => {
    if (!started) {
      setStarted(true)
      startSession()
    }
  }, [started, startSession])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = () => {
    if (!input.trim() || !sessionInfo) return

    sendCommand({
      type: 'user_input',
      content: input,
    })
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

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

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {messages.length === 0 && (
          <div style={{ color: '#666', textAlign: 'center', marginTop: '40%' }}>
            {sessionInfo ? 'Type a message to start...' : 'Connecting to CLI...'}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 600, color: msg.role === 'user' ? '#4a9eff' : '#fff' }}>
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', color: '#ddd' }}>
              {msg.content}
            </div>
          </div>
        ))}
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
      <div style={{ padding: '16px', borderTop: '1px solid #333', background: '#252525' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sessionInfo ? "Type a message or /command..." : "Connecting..."}
            disabled={!sessionInfo}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #333',
              background: sessionInfo ? '#2a2a2a' : '#1a1a1a',
              color: sessionInfo ? '#fff' : '#666',
              fontSize: '14px',
              cursor: sessionInfo ? 'text' : 'not-allowed',
            }}
          />
          <button
            onClick={handleSendMessage}
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
        </div>
      </div>
    </div>
  )
}

export default App
