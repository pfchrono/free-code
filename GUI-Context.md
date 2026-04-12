# GUI Development Context

## Detailed History, Problems, and Brainstorming

---

## 1. Project Origin

**Goal:** Build a cross-platform GUI for the free-code CLI using Tauri (Rust + React), similar to how OpenCode combines a console CLI with a Windows GUI.

**Long-term vision:** Eventually unify CLI and GUI into a single program with shared core.

---

## 2. Initial CLI Issues Discovered (Earlier Session)

Before GUI work began, several CLI bugs were fixed:

### 2.1 Windows TTY Detection
**Problem:** `process.stdout.isTTY` is `false` on Windows PowerShell even in interactive sessions.

**Fix:** Modified `src/main.tsx` to handle Windows TTY detection differently.

### 2.2 Async Module Issue
**Problem:** `require()` in Bun doesn't support async modules. `SendMessageTool.ts` caused hangs.

**Fix:** Skipped async module loading in `src/tools.ts`.

### 2.3 Null Tool Filter
**Problem:** `null` spread into tools array crashed `.filter()`.

**Fix:** Added null check in filter in `src/tools.ts`.

### 2.4 Missing `isReplBridgeActive`
**Problem:** Import existed but function didn't exist in `src/bootstrap/state.ts`.

**Fix:** Added stub implementation.

### 2.5 Command Aliases Crash
**Problem:** Non-array aliases caused `.join()` to crash.

**Fix:** Added type check for aliases in `src/commands.ts`.

### 2.6 Settings File Corruption
**Problem:** `C:\Users\pfchr\.claude\settings.json` had corrupted PowerShell strings (`@{matcher=*; hooks=System.Object[]}`).

**Fix:** Corrected JSON structure with proper nested objects.
- `extraKnownMarketplaces.source` needed nested `{source, repo}` object
- `disableAllHooks` was `true`, blocking statusLine and user hooks

---

## 3. GUI Mode Implementation

### 3.1 First Approach: Adding `--gui` Flag

**Decision:** Add a `--gui` flag to CLI that switches output mode from Ink TUI to JSON events over stdio.

**Implementation location:** `src/entrypoints/cli.tsx` lines 321-334

```typescript
if (args.includes('--gui')) {
  process.env.CLAUDE_CODE_GUI = '1';
  const { runGuiMode } = await import('../gui/guiMode.js');
  await runGuiMode();
  return;
}
```

### 3.2 Protocol Design (`guiProtocol.ts`)

**Design decision:** Use line-delimited JSON (NDJSON) over stdio for CLI↔GUI communication.

**Events (CLI → GUI):**
- `session_start` - Session info on startup
- `message` - User/assistant messages  
- `tool_use` - Tool execution started
- `tool_result` - Tool execution completed
- `completion` - Turn stats (tokens, duration)
- `error` - Error messages
- `status` - Status updates
- `models_list` - Available models
- `commands_list` - Available commands

**Commands (GUI → CLI):**
- `user_input` - User message
- `interrupt` - Cancel current operation
- `select_model` - Switch model/provider
- `get_models` - List available models
- `get_commands` - List available commands
- `heartbeat` - Connection check

**Rationale:** JSON was chosen over binary protocol for:
- Easier debugging
- Human-readable output
- Existing CLI infrastructure already uses JSON in headless mode

### 3.3 GUI Mode Handler (`guiMode.ts`)

**Initial implementation:** Stub responses only

**Key functions:**
- `runGuiMode()` - Entry point, sends session_start
- `processCommands()` - Main command loop reading from stdin
- `handleCommand()` - Dispatch to specific handlers
- `handleUserInput()` - Process user messages (STUBBED)
- `handleGetModels()` / `handleGetCommands()` - Return metadata

**Problem:** `handleUserInput()` uses stub responses, not real CLI core.

---

## 4. Tauri App Scaffolding

### 4.1 Directory Structure Created

```
gui/
├── src/
│   ├── App.tsx              # Main React component
│   ├── main.tsx             # React entry
│   └── hooks/
│       └── useCliSession.ts # CLI session hook
├── src-tauri/
│   ├── src/main.rs          # Rust IPC commands
│   ├── Cargo.toml           # Rust dependencies
│   └── tauri.conf.json     # Tauri config
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 4.2 Rust Backend Commands

**IPC commands defined:**
- `start_cli` - Spawn CLI process with `--gui` flag
- `send_cli_command` - Send JSON command to CLI stdin
- `read_cli_events` - Read JSON events from CLI stdout
- `stop_cli` - Kill CLI process
- `get_cli_status` - List active sessions

**Path resolution:** Looks for `dist/cli.exe` next to GUI executable or in parent directory.

### 4.3 React Hook (`useCliSession.ts`)

**Features:**
- Auto-connects CLI on mount
- Manages session ID
- Sends commands via Tauri IPC
- Parses CLI events
- Maintains message history

---

## 5. Build Process

### 5.1 CLI Build
```bash
bun run build  # Outputs to ./cli (bun build)
```

### 5.2 Tauri Build
```bash
cd gui
bun run build  # vite build

cd gui/src-tauri
cargo build --release  # Rust build
```

### 5.3 Binary Locations
- CLI: `gui/src-tauri/target/release/dist/cli.exe`
- GUI: `gui/src-tauri/target/release/free-code-gui.exe` (10.3 MB)
- Installer: `gui/src-tauri/target/release/bundle/nsis/Free-Code GUI_0.1.0_x64-setup.exe` (2.4 MB)

---

## 6. The Core Integration Problem

### 6.1 The Challenge

**Goal:** Connect real CLI core to `--gui` mode so user inputs actually process through `QueryEngine`.

**Complication:** The CLI has two execution paths:
1. **Interactive mode:** Ink TUI via `launchRepl()` in `main.tsx`
2. **Headless mode:** Single-turn `runHeadless()` in `src/cli/print.ts`

Neither is designed for a persistent GUI session.

### 6.2 CLI Architecture Analysis

**How headless mode works (`src/cli/print.ts`):**
```
1. Input: One prompt (stdin or argument)
2. Initialize tools, commands, MCP, etc.
3. Call runHeadlessStreaming() once
4. For-await loop processes messages
5. Exit when result received
```

**Key functions:**
- `runHeadless()` (line 455) - Orchestrates single-turn execution
- `runHeadlessStreaming()` (line 962) - AsyncIterable yielding SDK messages
- `QueryEngine.submitMessage()` (QueryEngine.ts:218) - Process one turn

**The problem:** `runHeadlessStreaming` is designed for ONE prompt then exit. GUI needs multiple prompts over time.

### 6.3 Brainstormed Solutions

#### Option A: Direct QueryEngine Integration (Preferred)

**Approach:**
1. In `--gui` mode, initialize `QueryEngine` once
2. For each user input, call `engine.submitMessage()`
3. Stream results via `writeGuiEvent()`

**Challenges:**
- Need to replicate complex `runHeadless()` initialization
- Tools, commands, MCP configs all need initialization
- Permission handling callbacks
- State management across turns

**Pros:**
- True multi-turn conversation
- Reuses all CLI infrastructure
- No protocol translation needed

#### Option B: Modify runHeadlessStreaming to loop

**Approach:**
- Wrap the for-await in a loop
- Detect "turn complete" and wait for next input

**Challenges:**
- stdin EOF detection
- Exit condition signaling
- Could break existing headless mode

**Risk:** High

#### Option C: Use `-p` mode with persistent process

**Approach:**
- Rust backend keeps CLI running
- Send prompts via stdin
- Read responses from stdout

**Problem:** `-p` mode exits when stdin closes

**Workaround needed:** Would need to keep stdin open somehow

#### Option D: Create new headless-gui mode

**Approach:**
- Create `runGuiStreaming()` that loops like Option A
- But isolated to new entry point

**Challenges:**
- Code duplication from `runHeadless()`
- Need to maintain both paths

---

## 7. Current State Summary

### 7.1 What's Working
- [x] CLI `--gui` flag detection and routing
- [x] JSON protocol over stdio
- [x] Stub responses in `handleUserInput()`
- [x] Tauri app builds and runs
- [x] Auto-connect CLI on frontend mount
- [x] IPC command/response flow

### 7.2 What's Not Working
- [ ] Real CLI core execution (stub responses only)
- [ ] Tool execution
- [ ] MCP server integration
- [ ] Conversation context across turns
- [ ] Streaming responses for long outputs

### 7.3 Next Step Priority

**HIGH PRIORITY: CLI Core Integration**

Best path forward:
1. In `guiMode.ts`, import `QueryEngine` and initialization helpers
2. Initialize once at startup: tools, commands, models
3. In `handleUserInput()`, call `queryEngine.submitMessage()`
4. Convert SDKMessage results to GUI events
5. Handle tool execution callbacks (auto-allow for now)

---

## 8. Key Files Reference

### CLI Core
| File | Purpose | Key Functions |
|------|---------|---------------|
| `src/entrypoints/cli.tsx` | CLI entry, flag detection | `main()` |
| `src/main.tsx` | Main CLI logic | `main()` |
| `src/cli/print.ts` | Headless execution | `runHeadless()`, `runHeadlessStreaming()` |
| `src/QueryEngine.ts` | Core query logic | `submitMessage()` |
| `src/cli/structuredIO.ts` | Input/output bridging | `StructuredIO` class |
| `src/gui/guiMode.ts` | GUI mode handler | `runGuiMode()`, `handleUserInput()` |
| `src/gui/guiProtocol.ts` | Protocol types | Type definitions |

### Tauri App
| File | Purpose |
|------|---------|
| `gui/src-tauri/src/main.rs` | Rust IPC commands |
| `gui/src/hooks/useCliSession.ts` | React hook for CLI session |
| `gui/src/App.tsx` | Main React component |

### Settings
| File | Issue |
|------|-------|
| `C:\Users\pfchr\.claude\settings.json` | Was corrupted, fixed |

---

## 9. Suggestions for Future Work

### 9.1 Immediate Next Step
Integrate `QueryEngine.submitMessage()` directly into `guiMode.ts`. Start with simplest case:
- Load tools/commands once at startup
- Call submitMessage for each user input
- Auto-allow tool permissions
- Skip MCP for initial implementation

### 9.2 Gradual Enhancement Path
1. **Phase 1:** Basic query integration (no tools)
2. **Phase 2:** Add tool execution with auto-allow
3. **Phase 3:** Add MCP server support
4. **Phase 4:** Add permission UI
5. **Phase 5:** Add streaming responses

### 9.3 Alternative Approach Worth Exploring
Consider creating a new `src/gui/guiHeadless.ts` that:
- Imports only the core query logic (not all of main.tsx)
- Creates a minimal CLI infrastructure for GUI
- Could eventually replace `--gui` flag

### 9.4 Testing Strategy
Before full integration, test with:
```bash
# Direct CLI test
echo '{"type":"user_input","content":"Hello"}' | ./dist/cli.exe --gui

# Should see session_start, then user message, then assistant response (stubbed)
```

Once real core is connected, this should produce actual AI responses.

---

## 10. Lessons Learned

### 10.1 Protocol Design
- Line-delimited JSON (NDJSON) over stdio works well
- Easy to debug, human-readable
- Matches existing CLI headless mode patterns

### 10.2 Tauri IPC
- Rust `BufReader` on `Child::stdout` works for reading lines
- Need to handle line buffering correctly
- `BufRead::read_line()` is blocking - fine for async IPC

### 10.3 CLI Architecture
- `main.tsx` is complex with many concerns
- Headless mode has different initialization path
- `QueryEngine` is the core stateful component for conversations

### 10.4 GUI Mode Design
- Subprocess approach keeps GUI simple
- CLI handles all complexity
- JSON protocol provides clean separation

---

## 11. Open Questions

1. **Permission handling?** Auto-allow for now, add UI later
2. **MCP support?** Initial implementation can skip
3. **Settings sync?** Share settings.json with CLI
4. **Streaming?** Could add later with SSE or chunked responses
5. **Session persistence?** Store sessions, allow resume

---

## 12. Resources

- [Tauri Documentation](https://tauri.app/)
- [OpenCode Architecture](https://github.com/opencode-ai/opencode) (reference)
- [SDKMessage types](src/entrypoints/agentSdkTypes.ts)
- [QueryEngine](src/QueryEngine.ts)
- [StructuredIO](src/cli/structuredIO.ts)
