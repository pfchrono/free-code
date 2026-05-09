import { writeGuiEvent, type GuiUserInputIntent } from './guiProtocol.js'

export type TurnOutcome = 'success' | 'error' | 'cancelled'

export function emitTurnStarted(startedAt: number): void {
  writeGuiEvent({
    type: 'turn_state',
    state: 'running',
    timestamp: startedAt,
  })
}

export function emitTurnInterrupting(): void {
  writeGuiEvent({
    type: 'turn_state',
    state: 'interrupting',
    timestamp: Date.now(),
  })
}

export function emitTurnFinished(outcome: TurnOutcome): void {
  writeGuiEvent({
    type: 'turn_state',
    state: outcome === 'cancelled' ? 'cancelled' : outcome === 'error' ? 'failed' : 'idle',
    timestamp: Date.now(),
  })

  if (outcome === 'cancelled' || outcome === 'error') {
    writeGuiEvent({
      type: 'turn_state',
      state: 'idle',
      timestamp: Date.now(),
    })
  }
}

export function emitCompletion(
  outcome: Exclude<TurnOutcome, 'success'>,
  input: string,
  startedAt: number,
  continuationIntent?: GuiUserInputIntent,
): void {
  writeGuiEvent({
    type: 'completion',
    outcome,
    continuationIntent,
    outputTokens: 0,
    inputTokens: Math.max(1, Math.floor(input.length / 4)),
    durationMs: Date.now() - startedAt,
  })
}
