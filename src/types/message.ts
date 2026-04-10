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

// Alias for backwards compatibility
export type Message = SDKMessage
