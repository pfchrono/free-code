---
name: feedback-stop-hook
description: User ran /stop hook which triggered this save — save session context to memory
type: feedback
---

Rule: When user invokes a `/stop` hook and it triggers an auto-save checkpoint, complete the current edit task then save session context to memory.

**Why:** Stop hook signals end of a work session; context should be preserved for future conversations.

**How to apply:** After /stop completes, save key decisions, code changes, and topic summaries to relevant memory files.
