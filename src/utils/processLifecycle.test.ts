import { describe, expect, it } from 'bun:test'
import {
  getProcessLifecycleSnapshot,
  registerLifecycleCleanup,
  registerOwnedProcessLifecycle,
  resetProcessLifecycleForTesting,
  runProcessLifecycleShutdown,
} from './processLifecycle.js'

describe('processLifecycle', () => {
  it('records timeout and failure diagnostics', async () => {
    resetProcessLifecycleForTesting()

    registerLifecycleCleanup(
      async () => {
        await new Promise(resolve => setTimeout(resolve, 25))
      },
      'slow-cleanup',
    )
    registerLifecycleCleanup(() => {
      throw new Error('cleanup boom')
    }, 'failing-cleanup')

    await runProcessLifecycleShutdown({
      timeouts: {
        cleanupMs: 5,
      },
    })

    const snapshot = getProcessLifecycleSnapshot()
    expect(snapshot.lastShutdown.timeoutCount).toBe(1)
    expect(snapshot.lastShutdown.failureCount).toBe(1)
    expect(
      snapshot.recentDiagnostics.some(
        diagnostic =>
          diagnostic.label === 'slow-cleanup' &&
          diagnostic.outcome === 'timeout',
      ),
    ).toBe(true)
    expect(
      snapshot.recentDiagnostics.some(
        diagnostic =>
          diagnostic.label === 'failing-cleanup' &&
          diagnostic.outcome === 'failed',
      ),
    ).toBe(true)
  })

  it('records forced termination for remaining owned process', async () => {
    resetProcessLifecycleForTesting()

    let forceKilled = false
    registerOwnedProcessLifecycle({
      label: 'fake-process',
      getPid: () => 4242,
      interrupt: () => {
        // Intentionally leave process alive.
      },
      forceKill: () => {
        forceKilled = true
      },
    })

    await runProcessLifecycleShutdown({
      deps: {
        isProcessRunningFn: pid => pid === 4242,
      },
    })

    const snapshot = getProcessLifecycleSnapshot()
    expect(forceKilled).toBe(true)
    expect(snapshot.lastShutdown.forcedTerminationCount).toBe(1)
    expect(
      snapshot.recentDiagnostics.some(
        diagnostic =>
          diagnostic.label === 'fake-process' &&
          diagnostic.phase === 'forced_termination' &&
          diagnostic.outcome === 'force_killed',
      ),
    ).toBe(true)
  })
})
