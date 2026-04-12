// Re-export SDK message types for backwards compatibility
export type {
  SDKBaseMessage,
  SDKAssistantMessage,
  SDKAssistantMessageError,
  SDKPartialAssistantMessage,
  SDKResultSuccess,
  SDKResultError,
  SDKResultMessage,
  SDKStatusMessage,
  SDKSystemMessage,
  SDKCompactBoundaryMessage,
  SDKToolProgressMessage,
  SDKPermissionDenial,
  SDKPermissionDenialEntry,
  SDKUserMessage,
  SDKUserMessageReplay,
  SDKMessage,
} from '../entrypoints/sdk/coreTypes.generated'

import type {
  SDKCompactBoundaryMessage,
  SDKMessage,
  SDKToolProgressMessage,
  SDKUserMessage,
} from '../entrypoints/sdk/coreTypes.generated'

// Backwards-compatible aliases used across app code
export type Message = SDKMessage
export type UserMessage = SDKUserMessage
export type ProgressMessage = SDKToolProgressMessage
export type HookResultMessage = SDKCompactBoundaryMessage
export type PartialCompactDirection = 'before' | 'after'
