import { registerHookCallbacks } from '../bootstrap/state.js'
import type { HookInput, HookJSONOutput } from '../entrypoints/agentSdkTypes.js'
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js'
import type { HookCallback } from '../types/hooks.js'
import {
  createEmptyAttributionState,
  trackFileCreation,
} from './commitAttribution.js'
import { logForDebugging } from './debug.js'

const fileContentCache = new Map<string, string>()

function getFilePathFromInput(input: HookInput): string | null {
  const toolInput = input.tool_input
  if (!toolInput || typeof toolInput !== 'object') return null
  if (!('file_path' in toolInput)) return null
  return typeof toolInput.file_path === 'string' ? toolInput.file_path : null
}

function getWriteContentFromInput(input: HookInput): string | null {
  const toolInput = input.tool_input
  if (!toolInput || typeof toolInput !== 'object') return null
  if (!('content' in toolInput)) return null
  return typeof toolInput.content === 'string' ? toolInput.content : null
}

async function handleAttributionHook(
  input: HookInput,
  _toolUseID: string | null,
  _signal: AbortSignal | undefined,
  _index: number,
  context?: {
    updateAttributionState?: (
      updater: (prev: ReturnType<typeof createEmptyAttributionState>) => ReturnType<typeof createEmptyAttributionState>,
    ) => void
  },
): Promise<HookJSONOutput> {
  if (input.hook_event_name !== 'PostToolUse') return {}

  const toolName =
    typeof input.tool_name === 'string' ? input.tool_name : undefined
  if (toolName !== FILE_WRITE_TOOL_NAME && toolName !== FILE_EDIT_TOOL_NAME) {
    return {}
  }

  const filePath = getFilePathFromInput(input)
  if (!filePath) return {}

  const content = getWriteContentFromInput(input)
  if (toolName === FILE_WRITE_TOOL_NAME && content != null) {
    fileContentCache.set(filePath, content)

    if (context?.updateAttributionState) {
      context.updateAttributionState(prev => {
        const base = prev ?? createEmptyAttributionState()
        return trackFileCreation(base, filePath, content)
      })
    }
  }

  logForDebugging(`Attribution hook observed ${toolName} for ${filePath}`)
  return {}
}

export function clearAttributionCaches(): void {
  fileContentCache.clear()
}

export function sweepFileContentCache(): void {
  if (fileContentCache.size <= 256) return

  const entries = Array.from(fileContentCache.entries())
  fileContentCache.clear()
  for (const [key, value] of entries.slice(-128)) {
    fileContentCache.set(key, value)
  }
}

export function registerAttributionHooks(): void {
  const hook: HookCallback = {
    type: 'callback',
    callback: handleAttributionHook,
    timeout: 1,
    internal: true,
  }

  registerHookCallbacks({
    PostToolUse: [
      { matcher: FILE_EDIT_TOOL_NAME, hooks: [hook] },
      { matcher: FILE_WRITE_TOOL_NAME, hooks: [hook] },
    ],
  })
}
