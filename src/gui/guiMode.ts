import { getCommands } from '../commands.js';
import type { Command } from '../commands.js';
import { QueryEngine } from '../QueryEngine.js';
import {
  getOriginalCwd,
  setMainLoopModelOverride,
} from '../bootstrap/state.js';
import type { SDKMessage, SDKResultMessage, SDKStatus } from '../entrypoints/agentSdkTypes.js';
import type { AppState } from '../state/AppStateStore.js';
import { getDefaultAppState } from '../state/AppStateStore.js';
import { getTools } from '../tools.js';
import { extractTextContent } from '../utils/messages.js';
import {
  getMainLoopModel,
  parseUserSpecifiedModel,
} from '../utils/model/model.js';
import { getModelOptions } from '../utils/model/modelOptions.js';
import { ensureModelStringsInitialized } from '../utils/model/modelStrings.js';
import { getAPIProvider } from '../utils/model/providers.js';
import { startupRawTrace } from '../utils/startupRawTrace.js';
import {
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
  type FileStateCache,
} from '../utils/fileStateCache.js';
import {
  writeGuiEvent,
  type GuiToCliCommand,
} from './guiProtocol.js';

declare const MACRO: { VERSION: string };

type GuiHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type GuiRuntime = {
  appState: AppState;
  commands: Command[];
  readFileCache: FileStateCache;
  engine: QueryEngine;
  toolNameByUseId: Map<string, string>;
  isTurnInFlight: boolean;
  interruptRequested: boolean;
  activeTurnPromise: Promise<void> | null;
};

const messageHistory: GuiHistoryMessage[] = [];

export async function runGuiMode(): Promise<void> {
  startupRawTrace('gui:runGuiMode started');

  const runtime = await initializeGuiRuntime();

  writeGuiEvent({
    type: 'session_start',
    version: typeof MACRO !== 'undefined' ? MACRO.VERSION : 'dev',
    model: getMainLoopModel(),
    provider: getAPIProvider(),
    timestamp: Date.now(),
    cwd: getOriginalCwd(),
  });

  writeGuiEvent({
    type: 'status',
    message: 'GUI mode initialized',
    level: 'info',
  });

  try {
    await processCommands(runtime);
  } finally {
    await teardownRuntime(runtime);
    writeGuiEvent({
      type: 'status',
      message: 'GUI session ended',
      level: 'info',
    });
  }
}

async function initializeGuiRuntime(): Promise<GuiRuntime> {
  await ensureModelStringsInitialized();

  let appState = getDefaultAppState();
  const commands = await getCommands(getOriginalCwd());
  const readFileCache = createFileStateCacheWithSizeLimit(
    READ_FILE_STATE_CACHE_SIZE,
  );

  const runtime: GuiRuntime = {
    appState,
    commands,
    readFileCache,
    engine: null as unknown as QueryEngine,
    toolNameByUseId: new Map(),
    isTurnInFlight: false,
    interruptRequested: false,
    activeTurnPromise: null,
  };

  runtime.engine = createEngine(runtime);

  return runtime;
}

function createEngine(
  runtime: GuiRuntime,
  initialMessages = [...runtime.engine?.getMessages?.() ?? []],
): QueryEngine {
  return new QueryEngine({
    cwd: getOriginalCwd(),
    tools: getTools(runtime.appState.toolPermissionContext),
    commands: runtime.commands,
    mcpClients: [],
    agents: [],
    ...(initialMessages.length > 0 ? { initialMessages } : {}),
    canUseTool: async (tool, _input, _context, _assistantMessage, toolUseID) => {
      if (toolUseID) {
        runtime.toolNameByUseId.set(toolUseID, tool.name);
      }

      return { behavior: 'allow' as const };
    },
    getAppState: () => runtime.appState,
    setAppState: updater => {
      runtime.appState = updater(runtime.appState);
    },
    readFileCache: runtime.readFileCache,
    userSpecifiedModel: getMainLoopModel(),
    fallbackModel: getMainLoopModel(),
  });
}

function recreateEngine(runtime: GuiRuntime): void {
  runtime.readFileCache = runtime.engine.getReadFileState();
  runtime.engine = createEngine(runtime, [...runtime.engine.getMessages()]);
}

async function processCommands(runtime: GuiRuntime): Promise<void> {
  startupRawTrace('gui:processCommands started');

  const state = { reading: true };

  while (state.reading) {
    const command = await readNextCommand(() => {
      state.reading = false;
    });

    if (command === null) {
      break;
    }

    await handleCommand(runtime, command);
  }
}

async function readNextCommand(
  stopReading: () => void,
): Promise<GuiToCliCommand | null> {
  return new Promise(resolve => {
    let data = '';

    const handleData = (chunk: string): void => {
      data += chunk;
      const lines = data.split('\n');
      data = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const command = JSON.parse(line) as GuiToCliCommand;
          cleanup();
          resolve(command);
          return;
        } catch {
          cleanup();
          resolve(null);
          return;
        }
      }
    };

    const handleEnd = (): void => {
      cleanup();
      resolve(null);
    };

    const cleanup = (): void => {
      stopReading();
      process.stdin.removeListener('data', handleData);
      process.stdin.removeListener('end', handleEnd);
    };

    process.stdin.on('data', handleData);
    process.stdin.on('end', handleEnd);
  });
}

async function handleCommand(
  runtime: GuiRuntime,
  command: GuiToCliCommand,
): Promise<void> {
  startupRawTrace(`gui:handleCommand type=${command.type}`);

  try {
    switch (command.type) {
      case 'user_input':
        await handleUserInput(runtime, command.content);
        return;
      case 'interrupt':
        handleInterrupt(runtime);
        return;
      case 'select_model':
        await handleSelectModel(runtime, command.provider, command.model);
        return;
      case 'get_models':
        handleGetModels();
        return;
      case 'get_commands':
        await handleGetCommands(runtime);
        return;
      case 'heartbeat':
        writeGuiEvent({
          type: 'status',
          message: 'ok',
          level: 'info',
        });
        return;
      default:
        writeGuiEvent({
          type: 'error',
          message: 'Unknown command type',
          code: 'UNKNOWN_COMMAND',
        });
    }
  } catch (error) {
    writeGuiEvent({
      type: 'error',
      message: `Error handling command: ${toErrorMessage(error)}`,
      code: 'HANDLER_ERROR',
    });
  }
}

async function handleUserInput(
  runtime: GuiRuntime,
  content: string,
): Promise<void> {
  if (runtime.isTurnInFlight) {
    writeGuiEvent({
      type: 'status',
      message: 'Wait for the current turn to finish or interrupt it first',
      level: 'warning',
    });
    return;
  }

  const timestamp = Date.now();
  const startedAt = Date.now();

  messageHistory.push({
    role: 'user',
    content,
    timestamp,
  });

  writeGuiEvent({
    type: 'message',
    role: 'user',
    content,
    timestamp,
  });

  writeGuiEvent({
    type: 'status',
    message: 'Processing...',
    level: 'info',
  });

  runtime.isTurnInFlight = true;
  runtime.interruptRequested = false;
  writeGuiEvent({
    type: 'turn_state',
    state: 'running',
    timestamp: startedAt,
  });

  const activeTurnPromise = (async () => {
    let turnOutcome: 'success' | 'error' | 'cancelled' = 'success';

    try {
      for await (const message of runtime.engine.submitMessage(content)) {
        emitGuiEventsForSdkMessage(runtime, message);
      }
    } catch (error) {
      if (runtime.interruptRequested) {
        turnOutcome = 'cancelled';
        writeGuiEvent({
          type: 'status',
          message: 'Turn cancelled',
          level: 'info',
        });
        writeGuiEvent({
          type: 'completion',
          outcome: 'cancelled',
          outputTokens: 0,
          inputTokens: Math.max(1, Math.floor(content.length / 4)),
          durationMs: Date.now() - startedAt,
        });
      } else {
        turnOutcome = 'error';
        writeGuiEvent({
          type: 'error',
          message: `Turn failed: ${toErrorMessage(error)}`,
          code: 'TURN_ERROR',
        });
        writeGuiEvent({
          type: 'status',
          message: 'Turn failed',
          level: 'error',
        });
        writeGuiEvent({
          type: 'completion',
          outcome: 'error',
          outputTokens: 0,
          inputTokens: Math.max(1, Math.floor(content.length / 4)),
          durationMs: Date.now() - startedAt,
        });
      }
    } finally {
      runtime.isTurnInFlight = false;
      runtime.activeTurnPromise = null;
      runtime.readFileCache = runtime.engine.getReadFileState();

      if (runtime.interruptRequested) {
        recreateEngine(runtime);
        runtime.interruptRequested = false;
        writeGuiEvent({
          type: 'status',
          message: 'Interrupt complete',
          level: 'info',
        });
      }

      writeGuiEvent({
        type: 'turn_state',
        state: turnOutcome === 'cancelled' ? 'cancelled' : 'idle',
        timestamp: Date.now(),
      });

      if (turnOutcome === 'cancelled') {
        writeGuiEvent({
          type: 'turn_state',
          state: 'idle',
          timestamp: Date.now(),
        });
      }
    }
  })();

  runtime.activeTurnPromise = activeTurnPromise;
  await activeTurnPromise;
}

function handleInterrupt(runtime: GuiRuntime): void {
  if (!runtime.isTurnInFlight) {
    writeGuiEvent({
      type: 'status',
      message: 'No active turn to interrupt',
      level: 'warning',
    });
    return;
  }

  runtime.interruptRequested = true;
  runtime.engine.interrupt();

  writeGuiEvent({
    type: 'turn_state',
    state: 'interrupting',
    timestamp: Date.now(),
  });
  writeGuiEvent({
    type: 'status',
    message: 'Interrupt requested',
    level: 'info',
  });
}

async function handleSelectModel(
  runtime: GuiRuntime,
  provider: string,
  model: string,
): Promise<void> {
  const activeProvider = getAPIProvider();
  if (provider && provider !== activeProvider) {
    writeGuiEvent({
      type: 'status',
      message: `Provider switch not supported in GUI mode yet. Keeping ${activeProvider}.`,
      level: 'warning',
    });
  }

  const parsedModel = parseUserSpecifiedModel(model);
  setMainLoopModelOverride(parsedModel);
  runtime.appState = {
    ...runtime.appState,
    mainLoopModel: parsedModel,
    mainLoopModelForSession: parsedModel,
  };
  runtime.engine.setModel(parsedModel);
  recreateEngine(runtime);

  writeGuiEvent({
    type: 'status',
    message: `Active model: ${getMainLoopModel()} (${getAPIProvider()})`,
    level: 'info',
  });
}

function handleGetModels(): void {
  writeGuiEvent({
    type: 'models_list',
    models: getModelOptions().map(option => ({
      id: String(option.value),
      name: option.label,
      provider: getAPIProvider(),
    })),
  });
}

async function handleGetCommands(runtime: GuiRuntime): Promise<void> {
  runtime.commands = await getCommands(getOriginalCwd());
  recreateEngine(runtime);

  writeGuiEvent({
    type: 'commands_list',
    commands: runtime.commands
      .filter(command => command.type === 'prompt' || command.type === 'local')
      .map(command => ({
        name: command.name,
        description: command.description || '',
        aliases: Array.isArray(command.aliases) ? command.aliases : undefined,
      })),
  });
}

function emitGuiEventsForSdkMessage(
  runtime: GuiRuntime,
  message: SDKMessage,
): void {
  switch (message.type) {
    case 'assistant': {
      const content = Array.isArray(message.message?.content)
        ? message.message.content
        : [];

      for (const block of content) {
        if (block.type === 'tool_use') {
          runtime.toolNameByUseId.set(block.id, block.name);
          writeGuiEvent({
            type: 'tool_use',
            tool: block.name,
            input: isRecord(block.input) ? block.input : {},
            timestamp: Date.now(),
          });
        }
      }

      const text = extractTextContent(
        content.filter(
          block =>
            block.type === 'text' ||
            block.type === 'thinking' ||
            block.type === 'redacted_thinking',
        ) as Array<{ type: string; text: string }>,
        '\n',
      ).trim();

      if (text) {
        messageHistory.push({
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
        });

        writeGuiEvent({
          type: 'message',
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
        });
      }
      return;
    }
    case 'user': {
      const content = message.message?.content;
      if (!Array.isArray(content)) {
        return;
      }

      for (const block of content) {
        if (block.type !== 'tool_result') {
          continue;
        }

        writeGuiEvent({
          type: 'tool_result',
          tool: runtime.toolNameByUseId.get(block.tool_use_id) ?? block.tool_use_id,
          output: getToolResultOutput(block.content),
          success: !Boolean(block.is_error),
          timestamp: Date.now(),
        });
      }
      return;
    }
    case 'status':
      writeGuiEvent({
        type: 'status',
        message: formatSdkStatus(message.status),
        level: 'info',
      });
      return;
    case 'system':
      if (message.subtype === 'compact_boundary') {
        writeGuiEvent({
          type: 'status',
          message: 'Conversation compacted',
          level: 'info',
        });
      } else if (message.subtype === 'api_retry') {
        writeGuiEvent({
          type: 'status',
          message: 'API retry in progress',
          level: 'warning',
        });
      } else if (typeof message.content === 'string' && message.content.trim()) {
        writeGuiEvent({
          type: 'status',
          message: message.content,
          level: 'info',
        });
      }
      return;
    case 'assistant_error':
      writeGuiEvent({
        type: 'error',
        message: message.message || 'Assistant error',
        code: 'ASSISTANT_ERROR',
      });
      return;
    case 'assistant_partial':
      if (message.delta?.trim()) {
        writeGuiEvent({
          type: 'status',
          message: 'Streaming response...',
          level: 'info',
        });
      }
      return;
    case 'tool_progress':
      writeGuiEvent({
        type: 'status',
        message: 'Tool running...',
        level: 'info',
      });
      return;
    case 'permission_denial':
      writeGuiEvent({
        type: 'status',
        message: `Tool denied: ${message.toolName ?? 'unknown'}`,
        level: 'warning',
      });
      return;
    case 'result':
      emitResultEvents(message);
      return;
    default:
      return;
  }
}

function emitResultEvents(message: SDKResultMessage): void {
  if (message.subtype !== 'success') {
    writeGuiEvent({
      type: 'error',
      message: message.errors.join('\n') || 'Turn failed',
      code: message.subtype,
    });
    writeGuiEvent({
      type: 'status',
      message: 'Turn failed',
      level: 'error',
    });
  }

  writeGuiEvent({
    type: 'completion',
    outcome: message.subtype === 'success' ? 'success' : 'error',
    outputTokens: getUsageNumber(message.usage, 'output'),
    inputTokens: getUsageNumber(message.usage, 'input'),
    durationMs: message.duration_ms,
  });
}

function getUsageNumber(
  usage: Record<string, unknown> | undefined,
  kind: 'input' | 'output',
): number {
  if (!usage) {
    return 0;
  }

  const candidates =
    kind === 'input'
      ? ['input_tokens', 'inputTokens']
      : ['output_tokens', 'outputTokens'];

  for (const key of candidates) {
    const value = usage[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function getToolResultOutput(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const text = extractTextContent(
      content.filter(
        block => isRecord(block) && block.type === 'text' && typeof block.text === 'string',
      ) as Array<{ type: string; text: string }>,
      '\n',
    ).trim();

    if (text) {
      return text;
    }
  }

  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function formatSdkStatus(status: SDKStatus): string {
  if (status === null) {
    return 'Ready';
  }

  if (status === 'compacting') {
    return 'Compacting conversation...';
  }

  return String(status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function teardownRuntime(runtime: GuiRuntime): Promise<void> {
  if (!runtime.isTurnInFlight) {
    return;
  }

  runtime.interruptRequested = true;
  runtime.engine.interrupt();

  try {
    await runtime.activeTurnPromise;
  } catch {
    // Active turn errors are already surfaced through GUI events.
  }
}
