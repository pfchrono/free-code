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

**Current implementation:** Real persistent runtime via `QueryEngine`

**Key functions:**
- `runGuiMode()` - Entry point, sends session_start
- `processCommands()` - Main command loop reading from stdin
- `handleCommand()` - Dispatch to specific handlers
- `handleUserInput()` - Calls `queryEngine.submitMessage()` for each turn
- `handleGetModels()` / `handleGetCommands()` - Return live runtime metadata
- `handleSelectModel()` - Updates main loop model override and recreates engine
- `handleInterrupt()` - Best-effort cancel + engine recreation

**Shipped behavior from archived `gui-core-integration`:**
- One persistent `QueryEngine` per GUI process
- Real assistant/tool/result/status/completion event mapping
- Live command/model surfaces instead of stubbed metadata
- Graceful teardown at session end

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

## 6. Core Integration History

### 6.1 Original Challenge

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

### 6.3 Chosen Solution

#### Option A: Direct QueryEngine Integration (Shipped)

**Approach:**
1. In `--gui` mode, initialize `QueryEngine` once
2. For each user input, call `engine.submitMessage()`
3. Stream results via `writeGuiEvent()`

**What shipped:**
- `guiMode.ts` now initializes tools, commands, app state, file cache, and `QueryEngine` once
- `user_input` flows through `submitMessage()`
- SDK stream maps into GUI protocol events
- `get_models`, `get_commands`, `select_model`, and `interrupt` are runtime-backed

**Remaining gaps:**
- Provider switching still partial
- GUI mode still skips MCP initialization
- Permissions still auto-allow, no GUI prompt surface

---

## 7. Current State Summary

### 7.1 What's Working
- [x] CLI `--gui` flag detection and routing
- [x] JSON protocol over stdio
- [x] Real multi-turn execution in `handleUserInput()`
- [x] Tauri app builds and runs
- [x] Auto-connect CLI on frontend mount
- [x] IPC command/response flow
- [x] Live command/model inventory
- [x] Tool lifecycle event propagation
- [x] Best-effort interrupt path

### 7.2 What's Not Working
- [ ] Full provider switching in GUI
- [ ] MCP server integration in GUI runtime
- [ ] GUI permission prompts / approval UX
- [ ] Rich transcript rendering in frontend
- [ ] Purpose-built tool progress UI

### 7.3 Next Step Priority

**HIGH PRIORITY: GUI Interaction Surface**

Best path forward:
1. Add command palette and slash-command UX to React frontend
2. Render assistant/tool output as rich transcript instead of plain text list
3. Surface tool progress and failures explicitly
4. Add permission/error affordances before deeper MCP work

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
Build first real frontend productivity pass on top of shipped core:
- command palette
- markdown/code transcript rendering
- tool progress presentation
- clearer model/provider UX

### 9.2 Gradual Enhancement Path
1. **Phase 3:** Command palette + transcript rendering
2. **Phase 3:** Tool progress + permission/error UX
3. **Phase 4:** MCP integration
4. **Phase 4:** Provider-switch parity
5. **Phase 5:** Session/tabs/sidebar workflows

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

1. **Permission handling?** Auto-allow still in place, UI still needed
2. **MCP support?** GUI runtime still initializes with empty MCP clients
3. **Settings sync?** Share settings.json with CLI, but frontend may need safe projection
4. **Provider switching?** Current `select_model` warns on provider mismatch
5. **Session persistence?** GUI should eventually expose resume/history intentionally

---

## 12. Resources

- [Tauri Documentation](https://tauri.app/)
- [OpenCode Architecture](https://github.com/opencode-ai/opencode) (reference)
- [SDKMessage types](src/entrypoints/agentSdkTypes.ts)
- [QueryEngine](src/QueryEngine.ts)
- [StructuredIO](src/cli/structuredIO.ts)
