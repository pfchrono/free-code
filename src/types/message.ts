// Re-export SDK message types for backwards compatibility
export type {
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
  SDKUserMessage,
  SDKUserMessageReplay,
  SDKMessage,
} from '../entrypoints/sdk/coreTypes.generated'

// Runtime message shapes predate the generated SDK union and still include
// internal-only variants. Keep the app-facing aliases loose while preserving
// the exported generated SDK types above for external API consumers.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Message = {
  type: string
  [key: string]: any
}
export type AssistantMessage = Message
export type UserMessage = Message
export type SystemMessage = Message
export type SystemAPIErrorMessage = Message
export type AttachmentMessage<T = any> = Message & { attachment: T }
export type ProgressMessage<T = any> = any
export type HookResultMessage = any
export type CollapsedReadSearchGroup<T = any> = any
export type CollapsibleMessage<T = any> = any
export type CompactMetadata = any
export type GroupedToolUseMessage = any
export type MessageOrigin = any
export type NormalizedAssistantMessage<T = any> = any
export type NormalizedMessage<T = any> = any
export type NormalizedUserMessage<T = any> = any
export type RenderableMessage = any
export type RequestStartEvent = any
export type StopHookInfo = any
export type StreamEvent = any
export type SystemAgentsKilledMessage = any
export type SystemApiMetricsMessage = any
export type SystemAwaySummaryMessage = any
export type SystemBridgeStatusMessage = any
export type SystemCompactBoundaryMessage = any
export type SystemFileSnapshotMessage = any
export type SystemInformationalMessage = any
export type SystemLocalCommandMessage = any
export type SystemMemorySavedMessage = any
export type SystemMessageLevel = any
export type SystemMicrocompactBoundaryMessage = any
export type SystemPermissionRetryMessage = any
export type SystemScheduledTaskFireMessage = any
export type SystemStopHookSummaryMessage = any
export type SystemThinkingMessage = any
export type SystemTurnDurationMessage = any
export type TombstoneMessage = any
export type ToolUseSummaryMessage = any
export type PartialCompactDirection = 'before' | 'after' | 'from' | 'up_to'
