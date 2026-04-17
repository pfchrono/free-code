---
name: feedback-stop-hook
description: User ran /stop hook which triggered this save — save session context to memory
type: feedback
---

Rule: When user invokes a `/stop` hook and it triggers an auto-save checkpoint, complete the current edit task then save session context to memory.

**Why:** Stop hook signals end of a work session; context should be preserved for future conversations.

**How to apply:** After /stop completes, save key decisions, code changes, and topic summaries to relevant memory files.

## Checkpoint: 2025-01-21

### Wiki Source Ingest (newly added to MEMORY.md)
- `src/services/wiki/ingest.ts` — `ingestWikiSource(cwd, sourcePath)` function
- Reads source file, extracts title, sanitizes slug, writes to `sourcesDir/*.md`
- Logs to `paths.logFile`
- Calls `rebuildWikiIndex(cwd)` after ingest
- Returns `WikiIngestResult: { sourceFile, sourceNote, summary, title }`
- Key imports: `getWikiPaths()`, `rebuildWikiIndex()`, `extractTitleFromText()`, `sanitizeWikiSlug()`, `summarizeText()`, `WikiIngestResult` type

### CLI Background Test
- `bun run ./src/entrypoints/cli.tsx` — test completed exit 0

### Key Decisions
- Stop hook triggers mid-session auto-save checkpoint
- User instructed: save key topics, decisions, quotes, and code to memory system

### Verbatim
- User: "AUTO-SAVE checkpoint. Save key topics, decisions, quotes, and code from this session to your memory system. Organize into appropriate categories. Use verbatim quotes where possible. Continue conversation after saving."

## Checkpoint: 2025-01-21 (continued)

### LRU Tracking Fix (persistentMemorySystem.ts)
- Query returned entries now update `lastAccess = Date.now()` on each read
- Lines 163-166 in `src/services/memory/persistentMemorySystem.ts`
- Fix ensures entries accessed via `queryEntries()` are properly aged for LRU eviction

## Checkpoint: 2025-01-22

### Prompt compaction checkpoint
- Session focused on prompt compaction review, not broad behavior changes
- Reviewed prompt-heavy tool files to identify low-risk next reductions
- Safe checkpoint reached before build/install of new `free-code` binary

### Files reviewed
- `src/tools/ReadMcpResourceTool/prompt.ts`
- `src/tools/ListMcpResourcesTool/prompt.ts`
- `src/tools/RemoteTriggerTool/prompt.ts`
- `src/tools/TaskCreateTool/prompt.ts`
- `src/tools/TaskUpdateTool/prompt.ts`
- `src/tools/TaskGetTool/prompt.ts`
- `src/tools/TaskOutputTool/prompt.ts`

### Key Decisions
- Good checkpoint for user to build/compile and install a new binary
- Remaining likely high-value prompt compaction targets still led by `TodoWriteTool`, then smaller task prompt cleanup

### Verbatim
- User: "are we at a good point where I can do a build/compile and install new free-code binary?"
- Reply: "Yes. Good point."

## Checkpoint: 2025-01-22 (install workflow)

### Install workflow decision
- `install.ps1` is the Windows-focused local rebuild/install path from a repo checkout
- Running `free-code.exe` keeps the launcher file locked on Windows, so the active binary may not be replaced until the process exits
- README updated to explain that `/exit` then rerunning `install.ps1` is the reliable refresh workflow

### Cross-platform note
- User wants any future install workflow improvement to stay cross-platform compatible
- Current README note is intentionally scoped to Windows behavior because `install.ps1` is PowerShell-specific
- If workflow is changed later, prefer documenting a shared cross-platform path separately from the Windows-only PowerShell path

### Files changed
- `README.md`

### Verbatim
- User: "that install.ps1 is how i do a build but it wont install new binary untill i do a /exit then run it"
- User: "unless we can modify the bun install with workflow on how install.ps1 works if so we need to add that information on how to Readme.md"
- User: "and we would have to be cross-platform compatiable since the ps1 install mainly helps with windows side"
