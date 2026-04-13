## 1. Snapshot foundation
- [ ] 1.1 Identify current sources for session identity, provider/model selection, context/token state, worktree state, MCP server health, and agent-policy flags.
- [ ] 1.2 Add normalized status snapshot types and a shared builder that gathers those sources without changing existing command behavior.
- [ ] 1.3 Add an initial `/status` command that renders concise grouped sections for session, model, context, worktree, MCP, and agent policy state.
- [ ] 1.4 Add degraded-state handling so unavailable MCP, context, or resume metadata surfaces as warnings instead of command failure.

## 2. Persisted resume memory
- [ ] 2.1 Identify existing session persistence read/write paths and document current backward-compatibility constraints in code comments or tests.
- [ ] 2.2 Introduce a versioned persisted session schema that can store visible messages, optional core messages, checkpoint metadata, and resume metadata.
- [ ] 2.3 Update restore logic to prefer valid core persisted memory, then fall back to visible history reconstruction, checkpoint data, or fresh session startup.
- [ ] 2.4 Record actual resume source so `/status` can report whether restore used fresh state, visible history, core persisted memory, or checkpointed state.

## 3. Compaction inspection
- [ ] 3.1 Identify effective compaction configuration inputs and expose them through the normalized status snapshot.
- [ ] 3.2 Record recent compaction runs as a bounded structured history with trigger, strategy, timestamps, and before/after counts when available.
- [ ] 3.3 Surface concise retained-versus-dropped summaries for recent compaction events in inspection output.
- [ ] 3.4 Add tests covering snapshot composition, persisted session migration and fallback, degraded subsystem status, and compaction event rendering.
