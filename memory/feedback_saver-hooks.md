---
name: feedback-saver-hooks
description: User wants memory saves done mid-session via feedback hook, not post-conversation
type: feedback
---

## Feedback: Auto-save mid-session via hooks

**Why:** User explicitly invoked "Stop hook feedback" during our spinnerVerbs deduplication session, requesting I save key topics immediately rather than waiting for conversation end.

**How to apply:** When user says "Save [X] to memory" or invokes a memory-related hook mid-conversation, save immediately to the appropriate memory file. Don't wait for conversation closure.
