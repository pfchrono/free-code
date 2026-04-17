---
name: mcp-code-summarizer-working
description: Code summarizer MCP operational, 76% compression on commands.ts
type: reference
---

## Code Summarizer MCP Status

**Working**. `summarize_file` on `src/commands.ts`:
- Original: 26,000 bytes, 779 lines
- Summary: 6,287 tokens
- Compression ratio: **0.76** (76% reduction)

**Call pattern:**
```typescript
mcp__code-summarizer__summarize_file({ filePath: "path/to/file" })
```

**Returns:** exports[], functions[], classes[], interfaces[], types[], imports[], summary text, originalSize, summarySize, compressionRatio
