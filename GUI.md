# Free-Code GUI Development Plan

## Overview

Build cross-platform Windows GUI app that integrates free-code CLI, similar to OpenCode's console CLI + Windows GUI.

**Target:** Win/Mac/Linux cross-platform via Tauri (Rust + web frontend)

---

## Current Status (Updated: 2026-04-22)

### ✅ Phase 1: Subprocess Bridge - COMPLETE

### ✅ Phase 2: CLI Core Integration - COMPLETE

**Completed:**
- [x] `--gui` flag in CLI (`src/entrypoints/cli.tsx`)
- [x] GUI mode protocol types (`src/gui/guiProtocol.ts`)
- [x] GUI mode handler with persistent `QueryEngine` runtime (`src/gui/guiMode.ts`)
- [x] Working event/command flow over stdio
- [x] Message history tracking
- [x] Slash command detection and routing
- [x] Tauri app scaffolded and builds
- [x] Rust backend with CLI process management
- [x] React frontend with auto-connect hook
- [x] App binary built: `gui/src-tauri/target/release/free-code-gui.exe`
- [x] NSIS installer built: `gui/src-tauri/target/release/bundle/nsis/`
- [x] Persistent `QueryEngine` runtime in GUI mode
- [x] Real `user_input` execution through `QueryEngine.submitMessage()`
- [x] Real `message`, `tool_use`, `tool_result`, `status`, `error`, and `completion` event emission
- [x] Runtime-backed `get_models`, `get_commands`, and `select_model`
- [x] Best-effort `interrupt` handling and GUI runtime teardown

**Working commands (live runtime):**
- `heartbeat` → `status: ok`
- `get_models` → `models_list` with current model/provider info
- `get_commands` → `commands_list` with live command metadata
- `user_input` → real multi-turn execution + `completion`
- `/slash commands` → routed through real command/query handling
- `interrupt` → best-effort cancel + engine recreation
- `select_model` → model override update with engine recreation

**What is still intentionally incomplete:**
- GUI mode currently starts `QueryEngine` with `mcpClients: []` in `src/gui/guiMode.ts`
- Tool permissions are auto-allowed via `canUseTool()` in `src/gui/guiMode.ts`
- Provider switching is partial: model override changes, but full provider rebinding is not implemented
- Frontend transcript/tool rendering still lags behind REPL parity

**Known residual risks:**
- Direct CLI smoke through some startup paths can still hit runtime guard `"Config accessed before allowed"`
- GUI mode has no approval dialog equivalent yet for plan/permission flows such as `ExitPlanMode`
- Error handling is session-level only; denied/failed tool calls do not yet get a first-class GUI UX

---

## Architecture Discovery

### How CLI Headless Mode Works

The CLI has two main execution paths:

1. **Interactive Mode (`main.tsx`):** Uses Ink/React TUI, `launchRepl()` for REPL loop
2. **Headless Mode (`src/cli/print.ts`):** Uses `runHeadless()` for batch processing

**Key functions:**
- `runHeadless()` (print.ts:455) - Single-turn headless execution
- `runHeadlessStreaming()` (print.ts:962) - AsyncIterable that yields SDK messages
- `QueryEngine` (QueryEngine.ts:193) - Core query logic, maintains `mutableMessages` for multi-turn
- `QueryEngine.submitMessage()` (QueryEngine.ts:218) - Processes one user turn, yields SDK messages

### Core Challenge Solved

`runHeadless()` is designed for single-turn batch processing:
```
Input: One prompt via stdin or argument
↓
Process: Call runHeadlessStreaming() once
↓
Output: Stream JSON to stdout
↓
Exit: Process terminates
```

GUI needed:
```
Input: Multiple prompts over time (stdin stays open)
↓
Process: Call runHeadlessStreaming() in a LOOP
↓
Output: Stream JSON to stdout for each turn
↓
Exit: Only when GUI closes or /exit command
```

**Key insight:** `QueryEngine` maintains state via `mutableMessages`, so GUI could keep one engine alive and submit turns directly without reworking `runHeadlessStreaming`.

### Integration Options

**Option 1: Modify runHeadlessStreaming to loop**
- Wrap the for-await loop to process multiple user inputs
- Challenges: Complex state management, stdin handling, exit conditions
- Risk: High, could break existing headless mode

**Option 2: Create new GUI headless mode**
- Create `runHeadlessGuiMode()` similar to `runHeadless()` but with multi-turn loop
- Initialize CLI infrastructure once (tools, commands, MCP, etc.)
- Call `QueryEngine.submitMessage()` for each user input
- Challenges: Need to replicate `runHeadless()` initialization
- Risk: Medium, isolated to new function

**Option 3: Use headless mode with persistent process**
- Keep `--gui` mode but spawn CLI in `-p` (print) mode
- Rust backend manages a persistent CLI process
- Send prompts via stdin, read responses from stdout
- **Problem:** `-p` mode exits after processing stdin content
- **Workaround:** Would need to keep stdin open with dummy content

**Option 4: Direct QueryEngine integration (Implemented)**
- In `--gui` mode, initialize `QueryEngine` once
- Call `engine.submitMessage()` for each user input turn
- Stream results via `writeGuiEvent()`
- **Result:** Chosen and shipped via archived OpenSpec change `gui-core-integration`

---

## What's Working Now

### CLI `--gui` Mode
```bash
# Test CLI GUI mode directly
& "F:\code\free-code-working\gui\src-tauri\target\release\dist\cli.exe" --gui
{"type":"session_start","version":"0.3.1","model":"MiniMax-M2.7","provider":"minimax",...}
{"type":"status","message":"GUI mode initialized","level":"info"}
```

### Live Runtime Behavior
- Real assistant output streams through GUI protocol events
- Tool calls map into `tool_use` and `tool_result`
- Session context persists across turns inside one `QueryEngine`
- Runtime command/model inventory comes from active state, not stubs

### Tauri App
- Builds successfully with `cargo build --release`
- Launches CLI as subprocess with `--gui` flag
- IPC commands: `start_cli`, `send_cli_command`, `read_cli_events`, `stop_cli`
- Auto-connects on mount via `useCliSession` hook

---

## Files Changed/Added

### CLI Core (Modified)
| File | Changes |
|------|---------|
| `src/entrypoints/cli.tsx` | Added `--gui` flag detection (line 321-334) |
| `src/gui/guiProtocol.ts` | JSON event/command types |
| `src/gui/guiMode.ts` | GUI mode handler with persistent runtime, event bridge, and command dispatch |
| `src/main.tsx` | Windows TTY detection bugfix |
| `src/tools.ts` | Async module skip + null filter fix |
| `src/commands.ts` | Aliases crash fix |
| `src/bootstrap/state.ts` | Added `isReplBridgeActive()` stub |

### Settings Fixed
- `C:\Users\pfchr\.claude\settings.json` - Fixed corrupted PowerShell strings

### Tauri GUI (New)
| File | Purpose |
|------|---------|
| `gui/src-tauri/src/main.rs` | Rust IPC commands |
| `gui/src/hooks/useCliSession.ts` | React hook for CLI session |
| `gui/src/App.tsx` | Main React component |

---

## Next Steps (Priority Order)

### 🔴 HIGH PRIORITY: Frontend Usability Pass

1. [ ] Command palette UI for slash commands and command discovery
2. [ ] Rich message rendering with markdown, code fences, and copy affordances
3. [ ] Better tool progress UI instead of generic status lines
4. [ ] Session-level error and permission UX for denied/failed tool calls
5. [ ] Reuse existing plan-approval UI patterns for GUI approval flows instead of inventing a parallel interaction model
6. [ ] Decide provider-switch strategy for full `select_model` parity

### 🟡 MEDIUM PRIORITY: Frontend Improvements

1. [ ] Model picker dropdown with active-provider clarity
2. [ ] Conversation transcript polish and streaming UX
3. [ ] Session resume and tab/history UI
4. [ ] Permission surface for tool approvals
5. [ ] If GUI introduces a post-plan next-step chooser, mirror the existing `ultraplanPendingChoice` / `UltraplanChoiceDialog` pattern before adding any new state shape

### 🟢 LOW PRIORITY: Nice to Have

1. [ ] Git diff sidebar
2. [ ] Project tree sidebar
3. [ ] Session tabs
4. [ ] Settings sync with CLI

---

## Technical Notes

### Key CLI Files for Integration

| File | Purpose |
|------|---------|
| `src/cli/print.ts` | Headless execution (`runHeadless`, `runHeadlessStreaming`) |
| `src/QueryEngine.ts` | Core query logic, `submitMessage()` |
| `src/cli/structuredIO.ts` | Input/output bridging (`StructuredIO` class) |
| `src/bootstrap/state.ts` | App state management |
| `src/tools.ts` | Tool registry |
| `src/commands.ts` | Command registry |
| `src/utils/processUserInput/processUserInput.ts` | User input processing |

### SDKMessage Types (from `src/entrypoints/agentSdkTypes.ts`)

```typescript
type SDKMessage =
  | { type: 'user', message: {...} }
  | { type: 'assistant', message: {...} }
  | { type: 'result', result: string, subtype: 'success' | 'error' }
  | { type: 'tool_use', tool: string, ... }
  | { type: 'tool_result', tool: string, ... }
  | { type: 'system', subtype: 'status' | 'error', ... }
```

---

## Build Commands

```bash
# Build CLI
bun run build

# Build Tauri app
cd gui
bun run build

# Build Rust backend only
cd gui/src-tauri
cargo build --release

# Build full Tauri with bundling
cargo build --release --bundles nsis
```

---

## Timeline

| Phase | Task | Status | Effort |
|-------|------|--------|--------|
| 1 | `--gui` flag + protocol | ✅ Done | 1 day |
| 1 | Tauri scaffold + build | ✅ Done | 1 day |
| 2 | CLI core integration | ✅ Done | 3-5 days |
| 3 | Command palette + rich transcript | 🔲 Pending | 3-4 days |
| 3 | Tool progress + permission UX | 🔲 Pending | 2-3 days |
| 4 | Model/provider picker polish | 🔲 Pending | 1-2 days |
| 5 | Git diff sidebar | 🔲 Pending | 2-3 days |
| 5 | Project tree | 🔲 Pending | 2-3 days |

---

## Open Questions

1. **Provider switching parity?** Current model override works, full provider switch still unresolved
2. **Permission handling?** Auto-allow remains initial behavior; GUI prompt flow still needed
3. **Plan-approval / next-step flow reuse?** Existing TUI already has `ExitPlanModePermissionRequest`, `ultraplanPendingChoice`, and `UltraplanChoiceDialog`; GUI should likely reuse those state concepts instead of inventing a second approval model
4. **MCP support in GUI?** Runtime currently uses empty MCP client set in GUI mode
5. **Settings sync?** Share settings.json with CLI, but expose GUI-safe subset

---

## Resources

- [Tauri Documentation](https://tauri.app/)
- [free-code CLI Entry Point](src/entrypoints/cli.tsx)
- [QueryEngine](src/QueryEngine.ts)
- [Headless Print](src/cli/print.ts)
- [StructuredIO](src/cli/structuredIO.ts)
