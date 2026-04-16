## ADDED Requirements

### Requirement: Effective compaction configuration is inspectable
The system SHALL expose the effective compaction configuration, including enabled state, trigger thresholds when available, and active strategy, through a user-visible inspection surface.

#### Scenario: User inspects compaction settings
- **WHEN** a user requests system status or compaction inspection
- **THEN** the system reports the effective compaction configuration currently applied to the session

### Requirement: Compaction events are recorded as bounded history
The system SHALL retain a bounded structured history of recent compaction events including trigger, strategy, timestamps, and before/after token or message counts when available.

#### Scenario: Automatic compaction runs
- **WHEN** compaction executes because context pressure crosses the configured threshold
- **THEN** the system appends a structured event to recent compaction history

### Requirement: Compaction inspection explains retained outcome
The system SHALL show a concise description of what compaction kept or dropped so users can understand the outcome of recent compaction runs.

#### Scenario: User reviews recent compaction event
- **WHEN** a recent compaction event is displayed
- **THEN** the inspection output includes a concise summary of retained and discarded context elements
