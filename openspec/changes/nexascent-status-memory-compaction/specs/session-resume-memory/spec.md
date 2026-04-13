## ADDED Requirements

### Requirement: Versioned persisted session memory
The system SHALL persist session state using a versioned schema that can store visible messages, optional core messages, checkpoint metadata, and resume metadata without breaking existing session files.

#### Scenario: New session state is written with version marker
- **WHEN** the system saves session state after compaction, autosave, or shutdown
- **THEN** the persisted payload includes an explicit version and the fields required for backward-compatible restore

### Requirement: Resume falls back safely on invalid core memory
The system SHALL attempt to restore from persisted core messages first and MUST fall back to visible-history reconstruction or fresh session startup when core memory is missing or invalid.

#### Scenario: Persisted core memory is corrupt
- **WHEN** the session restore process detects invalid or unreadable core messages
- **THEN** the system restores using visible history if available and records that fallback source

### Requirement: Resume failures remain inspectable
The system SHALL record the actual session resume source so user-facing status output can report whether restore used core messages, visible history, checkpoint data, or a fresh session.

#### Scenario: No persisted state is available
- **WHEN** the system starts without valid persisted core or visible session history
- **THEN** the session starts fresh and the reported resume source reflects a fresh session
