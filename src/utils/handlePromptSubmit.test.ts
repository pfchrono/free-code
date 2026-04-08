import { afterEach, describe, expect, it, mock } from 'bun:test'

import { QueryGuard } from './QueryGuard.js'
import { handlePromptSubmit } from './handlePromptSubmit.js'
import { peek, resetCommandQueue } from './messageQueueManager.js'

afterEach(() => {
  resetCommandQueue()
  mock.restore()
})

describe('handlePromptSubmit', () => {
  it('queues prompt submissions during active queries without interrupting', async () => {
    const abort = mock(() => {})
    const onInputChange = mock(() => {})
    const setPastedContents = mock(() => {})
    const resetHistory = mock(() => {})
    const clearBuffer = mock(() => {})

    const queryGuard = new QueryGuard()
    queryGuard.reserve()

    await handlePromptSubmit({
      input: 'follow-up guidance',
      mode: 'prompt',
      pastedContents: {},
      helpers: {
        setCursorOffset: mock(() => {}),
        clearBuffer,
        resetHistory,
      },
      onInputChange,
      setPastedContents,
      abortController: { abort } as unknown as AbortController,
      hasInterruptibleToolInProgress: true,
      messages: [],
      mainLoopModel: 'sonnet',
      ideSelection: undefined,
      querySource: 'input',
      commands: [],
      queryGuard,
      setToolJSX: mock(() => {}),
      getToolUseContext: mock(() => ({}) as never),
      setUserInputOnProcessing: mock(() => {}),
      setAbortController: mock(() => {}),
      onQuery: mock(async () => {}),
      setAppState: mock(() => {}),
    })

    expect(abort).not.toHaveBeenCalled()
    expect(peek()?.mode).toBe('prompt')
    expect(peek()?.value).toBe('follow-up guidance')
    expect(onInputChange).toHaveBeenCalledWith('')
    expect(setPastedContents).toHaveBeenCalledWith({})
    expect(resetHistory).toHaveBeenCalled()
    expect(clearBuffer).toHaveBeenCalled()
  })

  it('still interrupts non-prompt submissions when interruptible work is running', async () => {
    const abort = mock(() => {})

    const queryGuard = new QueryGuard()
    queryGuard.reserve()

    await handlePromptSubmit({
      input: 'ls',
      mode: 'bash',
      pastedContents: {},
      helpers: {
        setCursorOffset: mock(() => {}),
        clearBuffer: mock(() => {}),
        resetHistory: mock(() => {}),
      },
      onInputChange: mock(() => {}),
      setPastedContents: mock(() => {}),
      abortController: { abort } as unknown as AbortController,
      hasInterruptibleToolInProgress: true,
      messages: [],
      mainLoopModel: 'sonnet',
      ideSelection: undefined,
      querySource: 'input',
      commands: [],
      queryGuard,
      setToolJSX: mock(() => {}),
      getToolUseContext: mock(() => ({}) as never),
      setUserInputOnProcessing: mock(() => {}),
      setAbortController: mock(() => {}),
      onQuery: mock(async () => {}),
      setAppState: mock(() => {}),
    })

    expect(abort).toHaveBeenCalledWith('interrupt')
    expect(peek()?.mode).toBe('bash')
  })
})
