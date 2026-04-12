---
name: prompt-compaction-scan
description: Located prompt and memory injection surfaces for future prompt compaction work
---

## Session: Prompt compaction scan

### Topic
- Locate prompt-heavy files and memory injection surfaces before making compact replacements

### Files inspected
- `src/tools/TaskCreateTool/prompt.ts`
- `src/tools/TaskUpdateTool/prompt.ts`
- `src/commands.ts`
- `memory/MEMORY.md`
- `CLAUDE.md`
- `AGENTS.md`

### Findings
- Prompt surface likely spans repo instructions, agent instructions, tool prompt files, command descriptions, and memory injection
- Candidate patch targets noted:
  - `src/constants/prompts.ts`
  - `src/tools/TaskCreateTool/prompt.ts`
  - `src/tools/TaskUpdateTool/prompt.ts`
  - `src/services/memory/persistentMemorySystem.ts`

### No code edits yet
- This checkpoint only recorded discovery work and likely patch targets

### Verbatim user quote
- "AUTO-SAVE checkpoint. Save key topics, decisions, quotes, and code from this session to your memory system. Organize into appropriate categories. Use verbatim quotes where possible. Continue conversation after saving."

### Verbatim assistant summary
- "Found prompt surface. Main places: `CLAUDE.md`, `AGENTS.md`, `src/constants/prompts.ts`, `src/tools/TaskCreateTool/prompt.ts`, `src/tools/TaskUpdateTool/prompt.ts`, `src/commands.ts`, `memory/MEMORY.md`, `src/services/memory/persistentMemorySystem.ts`."
