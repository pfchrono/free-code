export type TokenUsagePair = {
  input: number;
  output: number;
};

export type TokenSmokenGuardReason =
  | 'short_turn_spike'
  | 'state_stream_mismatch'
  | 'history_spike'
  | 'safe_mode_mismatch';

export type TokenSmokenGuardState = {
  recentInputs: number[];
  consecutiveInterventions: number;
  safeModeTurnsRemaining: number;
};

export type TokenSmokenGuardResult = {
  usage: TokenUsagePair;
  intervened: boolean;
  reason?: TokenSmokenGuardReason;
  message?: string;
  state: TokenSmokenGuardState;
};

export type RunTokenSmokenGuardParams = {
  durationMs: number;
  streamUsage: TokenUsagePair;
  stateDeltaUsage: TokenUsagePair;
  state: TokenSmokenGuardState;
};

const HISTORY_LIMIT = 20;
const SAFE_MODE_TURNS = 3;
const SHORT_TURN_MS = 15_000;
const SHORT_TURN_INPUT_SPIKE = 250_000;
const EXTREME_INPUT_SPIKE = 1_000_000;
const HISTORY_SPIKE_MIN_INPUT = 100_000;
const HISTORY_SPIKE_MULTIPLIER = 8;
const STREAM_MISMATCH_MULTIPLIER = 20;
const STREAM_MISMATCH_MIN_DELTA = 50_000;

function toNonNegativeInt(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.floor((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function formatTokens(value: number): string {
  return value.toLocaleString();
}

function formatDurationSeconds(durationMs: number): string {
  return `${Math.max(1, Math.round(durationMs / 1000))}s`;
}

function getDeadpoolMessage(
  reason: TokenSmokenGuardReason,
  observed: TokenUsagePair,
  corrected: TokenUsagePair,
  durationMs: number,
  enteredSafeMode: boolean,
): string {
  const reasonText =
    reason === 'short_turn_spike'
      ? 'tiny turn, huge token flex'
      : reason === 'state_stream_mismatch'
        ? 'state counter and live stream picked different universes'
        : reason === 'history_spike'
          ? 'telemetry spike looked like sequel bait'
          : 'safe mode saw another suspicious stunt';
  const safeModeText = enteredSafeMode
    ? ' Safe mode armed for next 3 turns.'
    : '';
  return `TokenSmokenGuard: ${reasonText}. Saw ${formatTokens(observed.input)} In in ${formatDurationSeconds(durationMs)}; using ${formatTokens(corrected.input)} In.${safeModeText}`;
}

export function createTokenSmokenGuardState(): TokenSmokenGuardState {
  return {
    recentInputs: [],
    consecutiveInterventions: 0,
    safeModeTurnsRemaining: 0,
  };
}

export function runTokenSmokenGuard(
  params: RunTokenSmokenGuardParams,
): TokenSmokenGuardResult {
  const durationMs = toNonNegativeInt(params.durationMs);
  const streamUsage = {
    input: toNonNegativeInt(params.streamUsage.input),
    output: toNonNegativeInt(params.streamUsage.output),
  };
  const stateDeltaUsage = {
    input: toNonNegativeInt(params.stateDeltaUsage.input),
    output: toNonNegativeInt(params.stateDeltaUsage.output),
  };
  const observed = {
    input: Math.max(streamUsage.input, stateDeltaUsage.input),
    output: Math.max(streamUsage.output, stateDeltaUsage.output),
  };

  const previousMedian = median(params.state.recentInputs);
  const shortTurn = durationMs > 0 && durationMs <= SHORT_TURN_MS;
  const stateVsStreamInputDelta = stateDeltaUsage.input - streamUsage.input;
  const stateVsStreamMismatch =
    streamUsage.input > 0 &&
    stateDeltaUsage.input >= streamUsage.input * STREAM_MISMATCH_MULTIPLIER &&
    stateVsStreamInputDelta >= STREAM_MISMATCH_MIN_DELTA;
  const historySpike =
    previousMedian >= 1 &&
    stateDeltaUsage.input >= HISTORY_SPIKE_MIN_INPUT &&
    stateDeltaUsage.input >= previousMedian * HISTORY_SPIKE_MULTIPLIER;

  let reason: TokenSmokenGuardReason | undefined;
  if (
    params.state.safeModeTurnsRemaining > 0 &&
    stateVsStreamMismatch
  ) {
    reason = 'safe_mode_mismatch';
  } else if (
    shortTurn &&
    stateDeltaUsage.input >= SHORT_TURN_INPUT_SPIKE
  ) {
    reason = 'short_turn_spike';
  } else if (
    stateDeltaUsage.input >= EXTREME_INPUT_SPIKE ||
    stateVsStreamMismatch
  ) {
    reason = 'state_stream_mismatch';
  } else if (historySpike) {
    reason = 'history_spike';
  }

  let corrected = { ...observed };
  if (reason) {
    if (streamUsage.input > 0) {
      corrected.input = streamUsage.input;
    } else if (shortTurn && stateDeltaUsage.input > SHORT_TURN_INPUT_SPIKE) {
      corrected.input = SHORT_TURN_INPUT_SPIKE;
    }

    const stateOutputMismatch =
      streamUsage.output > 0 &&
      stateDeltaUsage.output >= streamUsage.output * STREAM_MISMATCH_MULTIPLIER &&
      stateDeltaUsage.output - streamUsage.output >= STREAM_MISMATCH_MIN_DELTA;
    if (stateOutputMismatch) {
      corrected.output = streamUsage.output;
    }
  }

  const usageChanged =
    corrected.input !== observed.input || corrected.output !== observed.output;
  const nextConsecutiveInterventions = reason
    ? params.state.consecutiveInterventions + 1
    : 0;
  const enteredSafeMode = nextConsecutiveInterventions >= 2;
  const decrementedSafeMode = Math.max(0, params.state.safeModeTurnsRemaining - 1);
  const nextSafeModeTurnsRemaining = enteredSafeMode
    ? SAFE_MODE_TURNS
    : decrementedSafeMode;
  const intervened = Boolean(reason && (usageChanged || enteredSafeMode));
  const nextRecentInputs = [...params.state.recentInputs, corrected.input].slice(
    -HISTORY_LIMIT,
  );
  const nextState: TokenSmokenGuardState = {
    recentInputs: nextRecentInputs,
    consecutiveInterventions: nextConsecutiveInterventions,
    safeModeTurnsRemaining: nextSafeModeTurnsRemaining,
  };

  return {
    usage: corrected,
    intervened,
    reason,
    message:
      intervened && reason
        ? getDeadpoolMessage(
            reason,
            observed,
            corrected,
            durationMs,
            enteredSafeMode,
          )
        : undefined,
    state: nextState,
  };
}
