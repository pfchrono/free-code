---
name: tool-results-truncated
description: Tool results often omitted due to context length in this environment
type: feedback
---

Tool results frequently "omitted for context length" — especially Read, Grep, Bash results.
**Why:** Context window limits trigger aggressive truncation.
**How to apply:** Keep queries narrow. Use `head -N` on bash output. Avoid reading large file sections. If first result is truncated, narrow scope before retrying.