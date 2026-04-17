import type { ChildProcess } from 'node:child_process'
import {
  isProcessRunning,
  terminateProcessTree,
} from './genericProcessUtils.js'

export type ProcessLifecyclePhase =
  | 'interrupt'
  | 'cleanup'
  | 'forced_termination'

export type ProcessLifecycleOutcome =
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'force_killed'
  | 'skipped'

export type ProcessLifecycleDiagnostic = {
  label: string
  kind: 'cleanup' | 'process'
  phase: ProcessLifecyclePhase
  outcome: ProcessLifecycleOutcome
  durationMs: number
  occurredAt: string
  pid?: number
  detail?: string
}

type CleanupRegistration = {
  id: string
  label: string
  cleanup: () => Promise<void> | void
}

type OwnedProcessRegistration = {
  id: string
  label: string
  getPid: () => number | undefined
  interrupt?: () => Promise<void> | void
  cleanup?: () => Promise<void> | void
  forceKill?: () => Promise<void> | void
}

type PhaseTimeouts = {
  interruptMs: number
  cleanupMs: number
  forceKillMs: number
}

export type ProcessLifecycleShutdownOptions = {
  timeouts?: Partial<PhaseTimeouts>
  deps?: {
    isProcessRunningFn?: typeof isProcessRunning
    terminateProcessTreeFn?: typeof terminateProcessTree
  }
}

export type ProcessLifecycleSnapshot = {
  ownedProcessCount: number
  activeProcessLabels: string[]
  cleanupHandlerCount: number
  recentDiagnostics: ProcessLifecycleDiagnostic[]
  lastShutdown: {
    at: string | null
    forcedTerminationCount: number
    timeoutCount: number
    failureCount: number
  }
}

const DEFAULT_TIMEOUTS: PhaseTimeouts = {
  interruptMs: 750,
  cleanupMs: 2000,
  forceKillMs: 1500,
}

const MAX_DIAGNOSTICS = 25

const cleanupRegistrations = new Map<string, CleanupRegistration>()
const ownedProcesses = new Map<string, OwnedProcessRegistration>()
const recentDiagnostics: ProcessLifecycleDiagnostic[] = []

let nextRegistrationId = 0
let lastShutdownAt: string | null = null
let lastForcedTerminationCount = 0
let lastTimeoutCount = 0
let lastFailureCount = 0

export function registerLifecycleCleanup(
  cleanup: () => Promise<void> | void,
  label = 'cleanup',
): () => void {
  const id = `cleanup-${++nextRegistrationId}`
  cleanupRegistrations.set(id, {
    id,
    label,
    cleanup,
  })
  return () => {
    cleanupRegistrations.delete(id)
  }
}

export function registerOwnedProcessLifecycle(
  registration: {
    label: string
    getPid: () => number | undefined
    interrupt?: () => Promise<void> | void
    cleanup?: () => Promise<void> | void
    forceKill?: () => Promise<void> | void
  },
): () => void {
  const id = `process-${++nextRegistrationId}`
  ownedProcesses.set(id, {
    id,
    ...registration,
  })
  return () => {
    ownedProcesses.delete(id)
  }
}

export function registerChildProcessLifecycle(
  child: ChildProcess,
  options: {
    label: string
    interrupt?: () => Promise<void> | void
    cleanup?: () => Promise<void> | void
    forceKill?: () => Promise<void> | void
  } = { label: 'child-process' },
): () => void {
  let unregister: (() => void) | undefined
  unregister = registerOwnedProcessLifecycle({
    label: options.label,
    getPid: () => child.pid ?? undefined,
    interrupt:
      options.interrupt ??
      (() => {
        if (child.pid) {
          return terminateProcessTree(child.pid, { force: false })
        }
      }),
    cleanup: options.cleanup,
    forceKill:
      options.forceKill ??
      (() => {
        if (child.pid) {
          return terminateProcessTree(child.pid, { force: true })
        }
      }),
  })

  const cleanupRegistration = (): void => {
    unregister?.()
    unregister = undefined
  }

  child.once('exit', cleanupRegistration)
  child.once('error', cleanupRegistration)

  return cleanupRegistration
}

export async function runProcessLifecycleShutdown(
  options: ProcessLifecycleShutdownOptions = {},
): Promise<void> {
  const timeouts: PhaseTimeouts = {
    ...DEFAULT_TIMEOUTS,
    ...options.timeouts,
  }
  const isProcessRunningFn =
    options.deps?.isProcessRunningFn ?? isProcessRunning
  const terminateProcessTreeFn =
    options.deps?.terminateProcessTreeFn ?? terminateProcessTree

  lastShutdownAt = new Date().toISOString()
  lastForcedTerminationCount = 0
  lastTimeoutCount = 0
  lastFailureCount = 0

  const processes = Array.from(ownedProcesses.values())
  const cleanups = Array.from(cleanupRegistrations.values())

  for (const processRegistration of processes) {
    await runLifecycleAction({
      label: processRegistration.label,
      kind: 'process',
      phase: 'interrupt',
      pid: processRegistration.getPid(),
      timeoutMs: timeouts.interruptMs,
      action: processRegistration.interrupt,
    })
  }

  for (const cleanupRegistration of cleanups) {
    await runLifecycleAction({
      label: cleanupRegistration.label,
      kind: 'cleanup',
      phase: 'cleanup',
      timeoutMs: timeouts.cleanupMs,
      action: cleanupRegistration.cleanup,
    })
  }

  for (const processRegistration of processes) {
    await runLifecycleAction({
      label: processRegistration.label,
      kind: 'process',
      phase: 'cleanup',
      pid: processRegistration.getPid(),
      timeoutMs: timeouts.cleanupMs,
      action: processRegistration.cleanup,
    })
  }

  for (const processRegistration of processes) {
    const pid = processRegistration.getPid()
    if (!pid || !isProcessRunningFn(pid)) {
      continue
    }

    lastForcedTerminationCount += 1
    await runLifecycleAction({
      label: processRegistration.label,
      kind: 'process',
      phase: 'forced_termination',
      pid,
      timeoutMs: timeouts.forceKillMs,
      action:
        processRegistration.forceKill ??
        (() => terminateProcessTreeFn(pid, { force: true })),
      forceKill: true,
    })
  }
}

export async function runRegisteredCleanupPhaseOnly(): Promise<void> {
  const cleanups = Array.from(cleanupRegistrations.values())
  for (const cleanupRegistration of cleanups) {
    await runLifecycleAction({
      label: cleanupRegistration.label,
      kind: 'cleanup',
      phase: 'cleanup',
      timeoutMs: DEFAULT_TIMEOUTS.cleanupMs,
      action: cleanupRegistration.cleanup,
    })
  }
}

export function getProcessLifecycleSnapshot(): ProcessLifecycleSnapshot {
  return {
    ownedProcessCount: ownedProcesses.size,
    activeProcessLabels: Array.from(ownedProcesses.values()).map(
      registration => registration.label,
    ),
    cleanupHandlerCount: cleanupRegistrations.size,
    recentDiagnostics: [...recentDiagnostics],
    lastShutdown: {
      at: lastShutdownAt,
      forcedTerminationCount: lastForcedTerminationCount,
      timeoutCount: lastTimeoutCount,
      failureCount: lastFailureCount,
    },
  }
}

export function resetProcessLifecycleForTesting(): void {
  cleanupRegistrations.clear()
  ownedProcesses.clear()
  recentDiagnostics.length = 0
  nextRegistrationId = 0
  lastShutdownAt = null
  lastForcedTerminationCount = 0
  lastTimeoutCount = 0
  lastFailureCount = 0
}

async function runLifecycleAction({
  label,
  kind,
  phase,
  pid,
  timeoutMs,
  action,
  forceKill = false,
}: {
  label: string
  kind: 'cleanup' | 'process'
  phase: ProcessLifecyclePhase
  pid?: number
  timeoutMs: number
  action?: () => Promise<void> | void
  forceKill?: boolean
}): Promise<void> {
  if (!action) {
    recordDiagnostic({
      label,
      kind,
      phase,
      outcome: 'skipped',
      durationMs: 0,
      pid,
    })
    return
  }

  const startedAt = Date.now()
  try {
    await runWithTimeout(action, timeoutMs)
    recordDiagnostic({
      label,
      kind,
      phase,
      outcome: forceKill ? 'force_killed' : 'completed',
      durationMs: Date.now() - startedAt,
      pid,
    })
  } catch (error) {
    const timedOut = error instanceof ProcessLifecycleTimeoutError
    if (timedOut) {
      lastTimeoutCount += 1
    } else {
      lastFailureCount += 1
    }

    recordDiagnostic({
      label,
      kind,
      phase,
      outcome: timedOut ? 'timeout' : 'failed',
      durationMs: Date.now() - startedAt,
      pid,
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

async function runWithTimeout(
  action: () => Promise<void> | void,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve(action()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ProcessLifecycleTimeoutError(timeoutMs))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

function recordDiagnostic(
  diagnostic: Omit<ProcessLifecycleDiagnostic, 'occurredAt'>,
): void {
  recentDiagnostics.push({
    ...diagnostic,
    occurredAt: new Date().toISOString(),
  })
  while (recentDiagnostics.length > MAX_DIAGNOSTICS) {
    recentDiagnostics.shift()
  }
}

class ProcessLifecycleTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Lifecycle action timed out after ${timeoutMs}ms`)
  }
}
