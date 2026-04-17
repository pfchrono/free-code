---
name: feedback-slash-commands
description: /undercovermode does NOT exist as slash command, only as utility module
type: feedback
---

## Slash Command Discovery

**`/undercovermode` does NOT exist as a slash command.** Memory in `slash-commands.md` was WRONG.

**How to apply:** When user asks about slash commands, verify against `src/commands.ts` COMMANDS list. Don't trust memory about commands without checking.

**Why:** `src/utils/undercover.ts` only provides `isUndercover()` and `getUndercoverInstructions()` — utility module, not a command. Slash command must be registered in `commands.ts` COMMANDS list to be callable.
