---
name: undercover-mode
description: undercover utility module, not slash command
type: reference
---

undercover mode is a utility module at `src/utils/undercover.ts`, **NOT a slash command**.

Core functions:
- `isUndercover()` — checks `process.env.USER_TYPE === 'ant'`
- `getUndercoverInstructions()` — returns stealth instructions for AI behavior

Usage: injects instructions into prompts to make AI behave less obviously like AI.

**Why**: ANT users want to operate stealthily.
**How to apply**: when user asks about `/undercovermode`, clarify it's internal utility, not slash command.
