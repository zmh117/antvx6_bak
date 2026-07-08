## ADDED Requirements

### Requirement: Remote collaboration applies bounded graph patches
The system SHALL translate safe business-flow Yjs transactions into bounded X6 graph patches for changed lanes, nodes, edges, ER references, and metadata without applying the entire canvas.

#### Scenario: Single node movement from another collaborator
- **WHEN** a remote Yjs transaction changes one business-flow node position
- **THEN** the local X6 graph updates that node without rebuilding unrelated lanes, nodes, or edges

#### Scenario: Single edge update from another collaborator
- **WHEN** a remote Yjs transaction changes one business-flow edge source, target, labels, or metadata
- **THEN** the local X6 graph updates that edge without rebuilding unrelated cells

#### Scenario: ER reference metadata update
- **WHEN** a remote Yjs transaction changes ER reference metadata for one business-flow node
- **THEN** the local X6 graph updates the affected node data while preserving unrelated canvas cells

### Requirement: Unsafe transactions fall back to full canvas apply
The system MUST use the existing full-canvas apply path when an incremental transaction cannot be applied safely.

#### Scenario: Initial collaboration load
- **WHEN** a business-flow Yjs document is first loaded into an empty or newly selected graph
- **THEN** the system applies the full canvas state before accepting incremental updates

#### Scenario: Missing graph dependency
- **WHEN** an incremental patch references a parent lane, node, source port, or target port that is absent from the local X6 graph
- **THEN** the system falls back to full-canvas apply for that transaction

#### Scenario: Large mixed transaction
- **WHEN** a Yjs transaction changes more entities than the configured incremental threshold
- **THEN** the system falls back to full-canvas apply for that transaction

#### Scenario: Patch application failure
- **WHEN** an incremental patch throws or produces an inconsistent local graph state
- **THEN** the system falls back to full-canvas apply and records the fallback reason for diagnostics

### Requirement: Local realtime writes avoid full graph serialization for known cells
The system SHALL update business-flow Yjs entity maps directly for known single-cell lane, node, edge, and removal edits without rebuilding a full draft from the X6 graph.

#### Scenario: Local node edit
- **WHEN** the active user moves, resizes, or edits a known business-flow node
- **THEN** the collaboration adapter writes only that node entry and does not call full graph-to-draft serialization for the realtime write

#### Scenario: Local edge edit
- **WHEN** the active user connects, reconnects, labels, or edits a known business-flow edge
- **THEN** the collaboration adapter writes only that edge entry and does not call full graph-to-draft serialization for the realtime write

#### Scenario: Unknown local edit
- **WHEN** the editor cannot identify a changed lane, node, edge, or removed cell
- **THEN** the collaboration adapter uses the existing full graph push path

### Requirement: Collaboration status and save state remain independent
The system MUST preserve separate handling for collaboration connection/errors, awareness state, and business-flow save/materialization state.

#### Scenario: Remote patch fails and recovers through full apply
- **WHEN** an incremental remote patch fails and the full apply fallback succeeds
- **THEN** collaboration status reflects the recovery without marking the business-flow snapshot save state as failed

#### Scenario: Backend materialization fails
- **WHEN** the collaboration sidecar stores Yjs updates but backend materialization fails
- **THEN** the save/materialization state reports the persistence problem without corrupting collaborator awareness state

### Requirement: Backend materialization compatibility is preserved
The system SHALL keep the existing collaboration materialization contract compatible with full business-flow semantic state.

#### Scenario: Collaboration document is stored
- **WHEN** the Hocuspocus sidecar persists a business-flow Yjs document
- **THEN** backend materialization receives a full business-flow state compatible with the existing snapshot materialization endpoint

#### Scenario: History restore or revision recovery
- **WHEN** a business-flow graph is restored from history or recovered after a collaboration revision mismatch
- **THEN** the system can rebuild the local graph and backend snapshot through the full-state path

### Requirement: Incremental collaboration performance is verifiable
The system SHALL provide focused validation for patch correctness, fallback behavior, and large-diagram interaction latency.

#### Scenario: Patch correctness tests
- **WHEN** automated tests run for the business-flow collaboration adapter
- **THEN** lane, node, edge, ER reference, metadata, delete, and mixed transactions are validated against expected graph changes

#### Scenario: Large diagram smoke test
- **WHEN** a large business-flow diagram is collaboratively edited in two clients
- **THEN** common single-cell edits remain interactive and do not trigger full apply except for documented fallback reasons
