## Context

Business-flow diagrams are edited through a React/X6 frontend, synchronized through a Yjs document in `businessFlowCollaboration.ts`, persisted by the Hocuspocus sidecar, and materialized back into backend snapshots through the existing business-flow HTTP router.

The current remote path listens to Yjs `afterTransaction` and applies the document back to X6 through a canvas-level operation. The current local realtime patch helpers also call a full graph-to-draft read before changing a single lane, node, or edge. This makes common collaborative actions such as moving a node, editing a field, or reconnecting an edge depend on whole-diagram traversal. It also keeps more pressure on lane normalization, graph diffing, and backend materialization even when the user changed one cell.

Constraints:

- All zoom levels must keep tables, fields, edges, and BPMN/business-flow nodes visible and clickable.
- Collaboration status, save state, and awareness must remain separate user-facing concerns.
- Existing Hocuspocus persistence and backend materialization must remain compatible with stored Yjs documents and current graph snapshots.
- Existing history/restore behavior and `collab_revision` recovery must keep a safe full-sync path.

## Goals / Non-Goals

**Goals:**

- Apply remote collaborative edits to X6 using changed Yjs keys when the transaction is small and structurally valid.
- Avoid rebuilding a full business-flow draft for known single-cell local realtime writes.
- Preserve full-canvas apply for initialization, graph reset, recovery, stale revisions, large batches, and unsafe patch cases.
- Keep backend materialization behavior compatible with the existing full semantic canvas payload.
- Add observable validation points so performance regressions and fallback frequency can be measured.

**Non-Goals:**

- Do not change the BPMN/business-flow node set or semantic schema beyond the minimum metadata needed for compatibility.
- Do not replace Yjs, Hocuspocus, AntV X6, or the backend persistence architecture.
- Do not introduce hidden visibility shortcuts that make nodes, fields, or edges non-interactive at any zoom level.
- Do not merge save-state errors with collaboration connection/status errors.

## Decisions

### Decision 1: Use Yjs transaction keys as the incremental boundary

Incremental application will derive a patch plan from the changed Yjs maps for lanes, nodes, edges, ER references, and metadata. Each patch entry identifies the entity type, entity id, operation kind, and whether the operation is safe to apply without a full graph rebuild.

Rationale: Yjs already records which shared types changed in a transaction. Using that information avoids inventing another diff format and keeps local and remote collaboration paths aligned.

Alternatives considered:

- Diff full canvas snapshots after every transaction. This still requires O(canvas) reads and defeats the main performance goal.
- Emit a custom operation bus outside Yjs. This risks divergence between persisted Yjs state, awareness, and backend materialization.

### Decision 2: Keep full-canvas apply as an explicit fallback

The incremental path will call the existing full apply when any of these conditions occurs:

- Initial document load or explicit graph seed.
- Transaction touches too many entities for bounded patching.
- The graph is missing required parent or endpoint cells.
- A lane/node/edge delete has ambiguous embedded children or connected edges.
- A revision mismatch, undo/redo replay, history restore, or materialization recovery is detected.
- Patch application throws or leaves the local graph inconsistent.

Rationale: Full apply is the compatibility and recovery path. The optimization is only correct if unsafe cases remain conservative.

Alternatives considered:

- Remove full apply once incremental patching exists. This is too risky for old documents, restore flows, and unknown multi-cell edits.
- Always prefer incremental even after partial failure. That can strand collaborators with divergent canvases.

### Decision 3: Add narrow X6 patch helpers instead of rewriting the renderer

The X6 layer will expose bounded helpers for upserting/removing one lane, one node, one edge, and ER reference metadata. These helpers reuse existing node/edge creation, data normalization, embedding, port alignment, and lane sizing logic where possible. Canvas-level functions remain the source for full render and fallback.

Rationale: This reduces blast radius while still removing full-graph work from common paths.

Alternatives considered:

- Rewrite the renderer around a virtual graph model. That is a larger architecture change and not required to solve the current bottleneck.
- Patch raw X6 cells directly from the Yjs adapter. That would duplicate business-flow rendering rules outside the X6 infrastructure module.

### Decision 4: Local realtime writes update Yjs entity maps directly

When the editor knows the changed cell, `patchLane`, `patchNode`, and `patchEdge` will serialize only that cell and update the matching Yjs map entry. Cell removal will delete known map keys directly. `pushGraph` remains for initial seed, explicit full sync, and unknown edits.

Rationale: The editor event path already knows the changed X6 cell for most interactions. Reading the whole graph before writing one map entry is avoidable work.

Alternatives considered:

- Keep local writes unchanged and optimize only remote apply. This leaves half of the collaboration hot path doing O(canvas) work.
- Batch every local edit through delayed full persistence. This reduces collaboration immediacy and makes multi-user conflict behavior worse.

### Decision 5: Preserve backend materialization as full semantic state

The collaboration sidecar can continue sending the full materialized business-flow state to the backend on store/debounce. The frontend optimization does not require changing backend write APIs. Backend changes should be limited to validation or telemetry unless implementation discovers an incompatibility.

Rationale: The current backend materialization code computes snapshot ops from current state and incoming full state. Replacing that contract is a separate persistence design problem.

Alternatives considered:

- Send incremental collaboration operations to the backend. This would require ordering guarantees, replay semantics, and migration work that are not needed for frontend interaction latency.

## Risks / Trade-offs

- Incorrect patch extraction could miss a remote change -> Mitigation: patch extractor must include unit tests for lane, node, edge, ER reference, metadata, delete, and mixed transactions.
- Incremental patching can leave local X6 state inconsistent after a rare structural edit -> Mitigation: detect missing dependencies and immediately fall back to full apply.
- More code paths can make renderer behavior harder to reason about -> Mitigation: keep helper APIs in the X6 infrastructure layer and reuse existing normalization utilities.
- Fallback can hide performance regressions if it triggers too often -> Mitigation: emit development diagnostics for patch counts, fallback reasons, and full-apply duration.
- Local direct Yjs writes could diverge from full draft serialization -> Mitigation: add round-trip tests comparing single-cell serialization with the existing full draft shape.

## Migration Plan

1. Introduce patch extraction and X6 patch helpers behind the existing collaboration adapter API.
2. Route remote transactions through incremental apply when safe; keep full apply as fallback.
3. Refactor local `patchLane`, `patchNode`, `patchEdge`, and remove-cell paths to avoid full draft reads for known cells.
4. Keep `pushGraph` and backend materialization unchanged for compatibility.
5. Validate with synthetic large diagrams and two-client collaboration smoke tests.
6. Roll back by disabling incremental application and routing all transactions through the existing full apply path.

## Open Questions

- What transaction-size threshold should force full apply for mixed edits on large diagrams?
- Should fallback diagnostics be development-only logs or exposed through an internal debug panel?
- Do history restore and collab revision recovery need a visible user message when a full resync occurs?
