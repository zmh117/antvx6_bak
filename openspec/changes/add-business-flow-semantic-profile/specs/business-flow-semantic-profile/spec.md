## ADDED Requirements

### Requirement: Business-flow diagrams support domain semantic profiles
The system SHALL allow business-flow nodes and edges to attach a domain semantic profile without changing the canonical BPMN node set.

#### Scenario: Generic BPMN task receives MES semantics
- **WHEN** a user selects a generic BPMN task node and assigns the MES manufacturing profile
- **THEN** the node stores the selected profile key, profile version, and structured semantic payload
- **AND** the node remains a generic BPMN task in the BPMN fields and toolbox

#### Scenario: Non-MES product uses a different profile
- **WHEN** a product defines or selects a non-MES business semantic profile
- **THEN** the same business-flow node and edge model accepts that profile through the generic profile mechanism
- **AND** no MES-specific field is required for the diagram to remain valid

### Requirement: Semantic profiles are registered and validated
The system SHALL provide a reusable profile definition contract for field schema, taxonomy, quality rules, target scope, and version.

#### Scenario: MES profile supplies controlled vocabulary
- **WHEN** the MES manufacturing profile is available
- **THEN** it defines controlled values for operation type, business object, resource type, and exception type
- **AND** node and edge payloads can be validated against those values

#### Scenario: Invalid profile payload is saved
- **WHEN** a node or edge payload contains a value outside the selected profile taxonomy
- **THEN** the backend rejects or normalizes the payload with a clear validation result
- **AND** the invalid semantic value is not silently persisted as trusted business meaning

### Requirement: Business semantics persist through graph lifecycle paths
The system SHALL preserve semantic profile fields across direct saves, incremental change ops, collaboration materialization, component publishing/placement, history, and restore.

#### Scenario: Collaborative materialization includes semantic payload
- **WHEN** a collaborator edits a node semantic payload and the Yjs document is materialized
- **THEN** the backend snapshot stores the updated semantic profile fields
- **AND** another user opening the same business flow sees the same semantic values

#### Scenario: History restore preserves semantic payload
- **WHEN** a business flow version with semantic profile data is restored
- **THEN** restored nodes and edges retain their profile keys, profile versions, and semantic payloads

#### Scenario: Old business flow has no profile
- **WHEN** a legacy business flow without semantic profile fields is opened
- **THEN** the flow remains valid with empty semantic payloads
- **AND** saving the flow does not reintroduce removed MES-specific JSON keys

### Requirement: Editor exposes profile-driven semantic editing
The system SHALL let users assign and edit business semantic profiles from the business-flow editor.

#### Scenario: User edits a MES manufacturing step
- **WHEN** a user opens a node property panel for a MES manufacturing step
- **THEN** the editor shows profile-driven fields such as operation type, business object, resources, materials, preconditions, postconditions, validation rules, and exception handlers

#### Scenario: User edits edge handoff semantics
- **WHEN** a user opens an edge property panel
- **THEN** the editor allows structured edge semantics such as condition, handoff, message, timeout policy, and exception type where supported by the selected profile

### Requirement: Modeling quality issues are detected
The system SHALL detect business-flow modeling quality issues that reduce Agent use-case generation accuracy.

#### Scenario: Gateway branch has no condition
- **WHEN** a gateway has outgoing sequence edges without condition text or semantic condition
- **THEN** the system reports a quality issue for the affected edge or gateway

#### Scenario: Critical task has no ER binding
- **WHEN** a profiled business task is marked as data-affecting but has no ER reference
- **THEN** the system reports a quality issue explaining that Agent use-case generation may be incomplete

#### Scenario: Data node uses invalid BPMN edge type
- **WHEN** a data node is connected with a non-association BPMN edge
- **THEN** the existing BPMN validation rejects the invalid edge

### Requirement: Agent context exposes structured business-flow semantics
The system SHALL extend graph Agent context with a structured business-flow context that includes semantic profile data.

#### Scenario: Agent requests graph context for use-case generation
- **WHEN** an Agent calls `GET /api/graphs/{graph_id}/agent-context`
- **THEN** the response includes existing text and document context
- **AND** includes structured business-flow context with flows, steps, edges, lanes, semantic payloads, ER references, rules, and quality issues

#### Scenario: Agent reads a MES production flow
- **WHEN** a MES business-flow diagram contains profiled steps for work order release, material weighing, feeding, quality check, release, and deviation handling
- **THEN** the structured context exposes operation types, business objects, branch conditions, exception paths, and ER read/write/check references needed to draft use cases

#### Scenario: Agent receives incomplete graph semantics
- **WHEN** a business flow has missing profile fields, missing edge conditions, or missing ER bindings
- **THEN** the Agent context includes quality issues so the Agent can ask for clarification or mark generated use cases as incomplete

### Requirement: The BPMN toolbox remains domain-neutral
The system MUST NOT add MES-specific BPMN nodes to the canonical toolbox as part of semantic profile support.

#### Scenario: User opens the swimlane BPMN toolbox
- **WHEN** the toolbox renders available BPMN nodes
- **THEN** it continues to show the canonical 15 generic BPMN options
- **AND** MES-specific concepts appear only through selected semantic profiles or templates
