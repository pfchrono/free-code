## ADDED Requirements

### Requirement: Unified system status snapshot
The system SHALL provide a unified status snapshot that aggregates session identity, resume source, current working directory, provider/model information, token pressure or estimated token usage, compaction state, worktree state, MCP server health, and agent policy flags into one normalized status view.

#### Scenario: Status snapshot includes all core sections
- **WHEN** a user invokes the status surface
- **THEN** the system returns grouped status information for session, model, context, worktree, MCP, and agent policy state

### Requirement: Status output reports degraded subsystem health
The system SHALL show degraded or unavailable state explicitly for MCP servers, resume metadata, or context data instead of omitting those sections or failing the entire status command.

#### Scenario: MCP server health is degraded
- **WHEN** at least one MCP server is in a connecting, error, or disabled state
- **THEN** the status output identifies the affected server and its degraded state

### Requirement: Status output shows session resume source
The system SHALL display whether the current session was restored from fresh state, visible history, core persisted memory, or checkpointed state.

#### Scenario: Session resumed from core memory
- **WHEN** the current session restore path used persisted core messages
- **THEN** the status output reports the resume source as core persisted memory
