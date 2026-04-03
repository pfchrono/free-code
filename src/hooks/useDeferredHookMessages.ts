import { useCallback, useEffect, useRef } from 'react'
import type { HookResultMessage, Message } from '../types/message.js'
import { logForDebugging } from '../utils/debug.js'
import { withTimeout } from '../utils/sleep.js'

const DEFERRED_HOOK_MESSAGES_WAIT_MS = 5000

/**
 * Manages deferred SessionStart hook messages so the REPL can render
 * immediately instead of blocking on hook execution (~500ms).
 *
 * Hook messages are injected asynchronously when the promise resolves.
 * Returns a callback that onSubmit should call before the first API
 * request to ensure the model always sees hook context.
 */
export function useDeferredHookMessages(
  pendingHookMessages: Promise<HookResultMessage[]> | undefined,
  setMessages: (action: React.SetStateAction<Message[]>) => void,
): () => Promise<void> {
  const pendingRef = useRef(pendingHookMessages ?? null)
  const resolvedRef = useRef(!pendingHookMessages)

  useEffect(() => {
    const promise = pendingRef.current
    if (!promise) return
    let cancelled = false
    promise
      .then(msgs => {
        if (cancelled || resolvedRef.current || pendingRef.current !== promise) {
          return
        }
        resolvedRef.current = true
        pendingRef.current = null
        if (msgs.length > 0) {
          setMessages(prev => [...msgs, ...prev])
        }
      })
      .catch(error => {
        if (cancelled || resolvedRef.current || pendingRef.current !== promise) {
          return
        }
        resolvedRef.current = true
        pendingRef.current = null
        logForDebugging(
          `Deferred SessionStart hooks failed: ${error instanceof Error ? error.message : String(error)}`,
          { level: 'warn' },
        )
      })
    return () => {
      cancelled = true
    }
  }, [setMessages])

  return useCallback(async () => {
    const promise = pendingRef.current
    if (resolvedRef.current || !promise) return
    try {
      const msgs = await withTimeout(
        promise,
        DEFERRED_HOOK_MESSAGES_WAIT_MS,
        'Deferred SessionStart hooks timed out',
      )
      if (resolvedRef.current || pendingRef.current !== promise) return
      resolvedRef.current = true
      pendingRef.current = null
      if (msgs.length > 0) {
        setMessages(prev => [...msgs, ...prev])
      }
    } catch (error) {
      if (resolvedRef.current || pendingRef.current !== promise) return
      resolvedRef.current = true
      pendingRef.current = null
      logForDebugging(
        `Deferred SessionStart hooks skipped before query: ${error instanceof Error ? error.message : String(error)}`,
        { level: 'warn' },
      )
    }
  }, [setMessages])
}
