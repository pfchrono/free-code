import type {
  CliToGuiEvent,
  GuiToCliCommand,
  GuiUserInputIntent,
} from './guiProtocol.js'

export type GuiCommandDecodeErrorReason =
  | 'empty_line'
  | 'invalid_json'
  | 'invalid_shape'
  | 'unknown_command_type'

export type GuiCommandDecodeFailure = {
  ok: false
  reason: GuiCommandDecodeErrorReason
  lineClass: 'empty' | 'malformed_json' | 'invalid_payload' | 'unknown_type'
}

export type DecodedGuiCommand =
  | { ok: true; command: GuiToCliCommand }
  | GuiCommandDecodeFailure

const VALID_COMMAND_TYPES = new Set<GuiToCliCommand['type']>([
  'user_input',
  'interrupt',
  'select_model',
  'get_models',
  'get_commands',
  'heartbeat',
])

const VALID_INPUT_INTENTS = new Set<GuiUserInputIntent>([
  'default',
  'continue',
  'handoff',
])

export function encodeGuiEvent(event: CliToGuiEvent): string {
  return JSON.stringify(event) + '\n'
}

export function decodeGuiCommand(line: string): DecodedGuiCommand {
  if (!line.trim()) {
    return { ok: false, reason: 'empty_line', lineClass: 'empty' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return { ok: false, reason: 'invalid_json', lineClass: 'malformed_json' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'invalid_shape', lineClass: 'invalid_payload' }
  }

  const type = (parsed as { type?: unknown }).type
  if (typeof type !== 'string' || !VALID_COMMAND_TYPES.has(type as GuiToCliCommand['type'])) {
    return { ok: false, reason: 'unknown_command_type', lineClass: 'unknown_type' }
  }

  if (!isValidCommandPayload(parsed as Record<string, unknown>, type as GuiToCliCommand['type'])) {
    return { ok: false, reason: 'invalid_shape', lineClass: 'invalid_payload' }
  }

  return { ok: true, command: parsed as GuiToCliCommand }
}

function isValidCommandPayload(
  parsed: Record<string, unknown>,
  type: GuiToCliCommand['type'],
): boolean {
  switch (type) {
    case 'user_input': {
      if (typeof parsed.content !== 'string') {
        return false
      }
      if (
        parsed.intent !== undefined &&
        (typeof parsed.intent !== 'string' ||
          !VALID_INPUT_INTENTS.has(parsed.intent as GuiUserInputIntent))
      ) {
        return false
      }
      return true
    }
    case 'select_model':
      return typeof parsed.provider === 'string' && typeof parsed.model === 'string'
    case 'interrupt':
    case 'get_models':
    case 'get_commands':
    case 'heartbeat':
      return true
    default:
      return false
  }
}
