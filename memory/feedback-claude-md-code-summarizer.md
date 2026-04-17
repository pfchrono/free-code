---
name: feedback-claude-md-code-summarizer
description: CLAUDE.md has stale observability section for code-summarizer MCP
type: feedback
---

CLAUDE.md observability section (lines 142-145) is WRONG — describes non-existent internal wrapper APIs (`prepareFileContent`, `estimateTokenSavings`) that don't match actual MCP tools.

**Why:** The actual MCP server only has two tools: `summarize_file` and `analyze_directory`. The observability section references `src/services/observability` wrappers that appear fabricated or removed.

**How to apply:** When updating CLAUDE.md, replace stale observability text with actual MCP tool names and descriptions. Keep tool selection table (line 100) accurate — it already has `summarize_file` correct.
