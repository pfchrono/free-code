---
name: bug-commitstandard-missing
description: commitStandard was imported but missing from COMMANDS() array
type: project
---

## Bug: /commit-standard command not registered

**Why:** `commitStandard` was imported and placed in `INTERNAL_ONLY_COMMANDS` but was never added to the `COMMANDS()` array — which is the actual registry used at runtime. Importing alone doesn't register a command.

**How to apply:** When adding new commands, verify they appear in `COMMANDS()` array — not just imported and in INTERNAL_ONLY. INTERNAL_ONLY is a filter for user-type gating, not a registration mechanism.
