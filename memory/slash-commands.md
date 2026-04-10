---
name: slash-commands
description: Internal slash commands in free-code — /commit-standard exists, /undercovermode does NOT
type: reference
---

## Slash Commands in free-code CLI

**`/commit-standard`** — Full commit workflow (defined in `src/commands/commit-standard.ts`):
- name: 'commit-standard'
- description: 'Stage all changes, generate detailed commit message, update docs, clean temp files, commit and push'
- Registers in `src/commands.ts` COMMANDS list

**`/undercovermode`** — **DOES NOT EXIST** as a slash command. `src/utils/undercover.ts` is a utility module (isUndercover(), getUndercoverInstructions()) but has no corresponding slash command entry. Memory was incorrect.

## Stop Hook Behavior
User uses `/stop` which triggers auto-save checkpoint via stop hook. The hook calls save memory mid-session.
