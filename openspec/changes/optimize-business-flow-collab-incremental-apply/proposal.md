## Why

Business-flow collaboration currently treats most remote Yjs document updates as a whole-canvas apply, and local realtime edits can rebuild a full draft before writing a small patch. This makes large diagrams pay O(canvas) work for O(1) edits, increasing latency, flicker risk, and save/materialization pressure as collaborative usage grows.

## What Changes

- Add incremental business-flow collaboration application so lane, node, edge, ER reference, and metadata changes can be translated from Yjs transactions into bounded X6 canvas updates.
- Keep full-canvas apply as the explicit fallback for initial sync, graph reset, stale revisions, large batch updates, and recovery from inconsistent local state.
- Refactor local realtime collaboration writes so known single-cell changes do not require rebuilding a full business-flow draft from the graph.
- Preserve existing save-state and collaboration-status semantics: persistence failures, collaboration connection/errors, and awareness state remain separate UI concerns.
- Preserve the Hocuspocus/Yjs persistence and backend materialization contract unless a later implementation step proves a narrow compatibility field is required.
- Add focused validation for incremental patch correctness, fallback behavior, and large-diagram interaction latency.

## Capabilities

### New Capabilities

- `business-flow-collaboration-incremental-apply`: Business-flow collaborative editing applies bounded canvas updates for changed Yjs keys while preserving full-sync fallback and persistence/materialization compatibility.

### Modified Capabilities

- None. There are no existing OpenSpec capability specs in this repository.

## Impact

- Frontend collaboration layer:
  - `front/src/features/business-flow/infrastructure/yjs/businessFlowCollaboration.ts`
  - `front/src/features/business-flow/infrastructure/x6/businessFlowX6.ts`
  - `front/src/features/business-flow-editor/index.tsx`
- Backend and collaboration sidecar behavior to preserve and validate:
  - `back/app/interfaces/http/routers/business_flow/routes.py`
  - `collab/src/server.js`
  - `collab/src/materialize.js`
- Runtime systems affected:
  - Yjs document schema and transaction handling
  - AntV X6 business-flow canvas rendering and cell patching
  - Hocuspocus collaboration persistence
  - Business-flow snapshot materialization and history/restore compatibility
- No database migration, BPMN node-set change, or transport replacement is expected for the first implementation.
