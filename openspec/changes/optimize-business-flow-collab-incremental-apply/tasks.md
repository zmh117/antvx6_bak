## 1. Baseline And Test Harness

- [x] 1.1 Identify the current frontend test/build entry points for business-flow infrastructure and document any missing harness needed for collaboration adapter tests
- [x] 1.2 Add focused unit-test coverage around the current Yjs document shape for lanes, nodes, edges, ER references, metadata, deletes, and mixed transactions
- [x] 1.3 Add a synthetic large-diagram fixture or factory that can create enough lanes, nodes, edges, and references to expose whole-canvas traversal regressions

## 2. Yjs Patch Extraction

- [x] 2.1 Define an internal patch-plan type for changed business-flow lanes, nodes, edges, ER references, metadata, deletes, and fallback reasons
- [x] 2.2 Implement a Yjs transaction extractor in the business-flow collaboration infrastructure that maps changed shared types to patch-plan entries
- [x] 2.3 Add thresholds and safety checks that mark initial load, large mixed transactions, missing dependencies, and unknown shared-type changes as full-apply fallbacks
- [x] 2.4 Verify extractor behavior with unit tests for single-entity, multi-entity, delete, metadata-only, and unsafe transactions

## 3. Bounded X6 Apply Helpers

- [x] 3.1 Add X6 infrastructure helpers to upsert and remove one business-flow lane while preserving embedding and lane sizing rules
- [x] 3.2 Add X6 infrastructure helpers to upsert and remove one business-flow node while preserving ports, semantic data, and parent-lane placement
- [x] 3.3 Add X6 infrastructure helpers to upsert and remove one business-flow edge while preserving source/target ports, labels, routing, and metadata
- [x] 3.4 Add bounded ER reference metadata application for affected business-flow nodes
- [x] 3.5 Add consistency checks that trigger full apply when required cells, parent lanes, source ports, or target ports are missing

## 4. Collaboration Adapter Integration

- [x] 4.1 Route remote Yjs transactions through incremental patch application when the patch plan is safe
- [x] 4.2 Preserve the existing full-canvas apply path for initial load, graph seed, stale revision recovery, history restore, unsafe transactions, and patch failures
- [x] 4.3 Refactor local `patchLane`, `patchNode`, and `patchEdge` writes to serialize the known changed cell directly into the matching Yjs map entry
- [x] 4.4 Refactor known cell-removal writes to delete the matching Yjs map keys directly
- [x] 4.5 Keep `pushGraph` as the explicit full-sync path for unknown local edits and recovery flows

## 5. Editor State And Compatibility

- [x] 5.1 Ensure business-flow editor event handlers pass known changed cells to realtime collaboration paths before scheduling full persistence
- [x] 5.2 Preserve separate handling for collaboration connection/errors, awareness users, and save/materialization state
- [x] 5.3 Ensure incremental remote apply does not reset selection, viewport, zoom, or interactive availability of visible cells
- [x] 5.4 Confirm history restore and collaboration revision recovery still rebuild through the full-state path

## 6. Backend And Sidecar Validation

- [x] 6.1 Confirm Hocuspocus persistence still stores Yjs updates without requiring a new transport or operation protocol
- [x] 6.2 Confirm collaboration materialization still sends full business-flow semantic state to the existing backend materialization endpoint
- [x] 6.3 Add backend or sidecar validation only if implementation discovers an incompatibility with full-state materialization

## 7. Verification And Rollout

- [x] 7.1 Run frontend build/type checks after the collaboration and X6 changes
- [x] 7.2 Run unit tests for patch extraction, bounded apply, local direct writes, fallback behavior, and serialization parity
- [x] 7.3 Perform a two-client browser smoke test covering node move, node edit, edge reconnect, lane resize, cell delete, ER reference edit, and recovery fallback
- [x] 7.4 Measure large-diagram single-cell edit latency and verify documented fallback reasons are the only full-apply triggers
- [x] 7.5 Document rollback by disabling incremental apply and routing all transactions through the existing full-canvas apply path
