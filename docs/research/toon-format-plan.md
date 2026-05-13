# TOON Format Plan for Free-Code

## Goal

Use TOON as an LLM-facing structured-data encoding in Free-Code where it can cut prompt/output tokens without breaking JSON-based protocols, storage, or SDK compatibility.

TOON should not replace JSON everywhere. Free-Code should keep JSON/JSONL for transcript storage, MCP/SDK wire formats, settings, analytics, and schema-constrained provider APIs. TOON should sit at the boundary where Free-Code turns structured objects into model-readable text.

## Source Notes

- TOON is a lossless JSON data model encoding optimized for LLM input, especially uniform arrays of objects, where field names are declared once and rows stream compactly.
- Best fit: uniform arrays with primitive fields, tool/search/result tables, event lists, and compact context bundles.
- Poor fit: deeply nested/non-uniform objects, latency-critical paths unless benchmarked, and pure protocol data that consumers already expect as JSON.
- LLM prompting guidance: show small TOON examples, use fenced `toon` blocks, state `[N]` row counts must match, and validate generated TOON with strict decoding.
- Useful options: tab delimiter for token savings; `encodeLines()`/line decoding for large streamed data.

Docs reviewed:

- https://toonformat.dev/guide/getting-started.html
- https://toonformat.dev/guide/format-overview.html
- https://toonformat.dev/guide/llm-prompts.html

## Proposed Architecture

Add a narrow serialization layer:

```text
Free-Code typed objects
  -> existing JSON for machines/storage/wire
  -> TOON for selected model-visible text blocks
```

New utility module:

- `src/utils/llmStructuredFormat.ts`
- Exports:
  - `encodeForModel(value, options): { format: 'json' | 'toon'; text: string; stats }`
  - `shouldUseToon(value, options): boolean`
  - `decodeModelStructuredText(text, expectedFormat, options): unknown`

Default policy:

- `json`: current behavior.
- `toon`: force TOON for eligible model-facing data.
- `auto`: use TOON only when heuristic predicts savings and structure is suitable.

Controls:

- Env: `FREE_CODE_LLM_DATA_FORMAT=json|toon|auto`
- Optional setting later: `modelContextFormat`.
- Feature flag or dev-only default first: `auto` behind opt-in.

## Heuristic

Use TOON when:

- Object contains arrays of objects with identical keys.
- Array rows are primitive values only.
- JSON stringified size is above a small threshold, e.g. 500 chars.
- Estimated TOON chars/tokens save at least 10%.

Keep JSON when:

- Data is protocol output, settings, transcript/event storage, MCP transport, SDK stream-json, or provider structured output.
- Object is deeply nested and non-uniform.
- Consumer explicitly expects JSON.
- Schema validation depends on JSON object shape at wire level.

## Integration Targets

Phase 1: safe encoder and benchmarks

- Add `@toon-format/toon`.
- Add utility wrapper with strict TypeScript types, telemetry-free stats, and fallback to JSON on encode/decode failure.
- Add unit tests for primitives, nested objects, uniform arrays, non-uniform arrays, and round-trips.
- Add benchmark fixture comparing pretty JSON, compact JSON, and TOON over representative Free-Code payloads.

Phase 2: model-visible context only

- Convert large structured blocks inside prompts/tool result rendering, not raw tool protocol payloads.
- Good first candidates:
  - Tool search/deferred tool match lists.
  - Codebase search result summaries.
  - Session/context inspector category rows.
  - Large file metadata/result tables.
  - Agent/team status lists.
- Wrap with concise prompt hint:
  - `Data is TOON format. Arrays declare length and fields.`
  - Use fenced `toon` block for user-visible/model-visible text.

Phase 3: opt-in output mode

- For Free-Code commands that ask model to return structured lists/tables, support TOON output instructions.
- Decode with strict mode.
- If TOON decode fails, ask model for repair or fall back to JSON path.
- Do not use TOON for provider `jsonSchema` structured output until provider accepts it natively.

Phase 4: measure and decide defaults

- Add token/latency instrumentation around JSON vs TOON conversion points.
- Track:
  - estimated token savings,
  - encode/decode time,
  - decode failure rate,
  - model repair rate,
  - end-to-end latency.
- Promote `auto` from opt-in only if savings are clear and errors stay low.

## Implementation Sketch

```ts
import { decode, encode } from '@toon-format/toon'
import { jsonStringify } from './slowOperations.js'

export type LlmStructuredFormat = 'json' | 'toon' | 'auto'

export function encodeForModel(
  value: unknown,
  options: { format?: LlmStructuredFormat; delimiter?: ',' | '\t' | '|' } = {},
): { format: 'json' | 'toon'; text: string } {
  const json = jsonStringify(value, null, 2)
  const requested = options.format ?? process.env.FREE_CODE_LLM_DATA_FORMAT ?? 'json'
  if (requested === 'json') return { format: 'json', text: json }

  try {
    const toon = encode(value, { delimiter: options.delimiter ?? '\t' })
    if (requested === 'toon' || toon.length < json.length * 0.9) {
      return { format: 'toon', text: toon }
    }
  } catch {
    // JSON fallback keeps behavior stable.
  }

  return { format: 'json', text: json }
}

export function decodeModelStructuredText(text: string, format: 'json' | 'toon'): unknown {
  return format === 'toon' ? decode(text, { strict: true }) : JSON.parse(text)
}
```

## Risks

- TOON can save tokens but add CPU and parsing complexity.
- Models may hallucinate malformed row counts; strict decode must be mandatory for generated TOON.
- Some humans/tools expect copy-paste JSON. Keep JSON controls and clear labels.
- Tab-delimited TOON can be hard to inspect in terminals. Use comma for human-facing display, tab for hidden/model-only prompt blocks if benchmarks justify it.

## Acceptance Criteria

- No change to existing JSONL transcripts, MCP transport, settings files, or SDK stream-json.
- Opt-in flag can render selected large model-context blocks as TOON.
- Unit tests prove round-trip and fallback behavior.
- Benchmark report shows token and latency tradeoffs on real Free-Code payloads.
- Build and focused tests pass.
