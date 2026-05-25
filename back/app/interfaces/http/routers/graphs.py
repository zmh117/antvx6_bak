from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.application.graph_sync import graph_sync_service
from app.config import get_settings
from app.database import db_transaction, get_connection
from app.interfaces.http.schemas.graph import (
    AgentContextResponse,
    CanvasSnapshotPayload,
    GraphLoadResponse,
    GraphMetaResponse,
    HistoryResponse,
    NormalizedGraphPayload,
    RestoreRequest,
    RestoreResponse,
    SyncChangesRequest,
    SyncFullRequest,
    SyncResponse,
)
from app.services.agent import build_agent_context
from app.services.history import list_change_history
from app.services.load import load_graph
from app.services.normalize import normalize_from_canvas, normalize_legacy_tables_array
from app.services.restore import restore_from_change_log
from app.services.sync import VersionConflictError, apply_full_sync

router = APIRouter(prefix="/graphs", tags=["graphs"])


@router.get("", response_model=list[GraphMetaResponse])
def list_graphs() -> list[GraphMetaResponse]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, description, business_domain, version, status FROM er_graph ORDER BY name"
            )
            rows = cur.fetchall()
    return [
        GraphMetaResponse(
            id=r["id"],
            name=r["name"],
            description=r["description"],
            business_domain=r["business_domain"],
            version=r["version"],
            status=r["status"],
        )
        for r in rows
    ]


@router.get("/{graph_id}", response_model=GraphLoadResponse)
def get_graph(graph_id: UUID) -> GraphLoadResponse:
    try:
        with get_connection() as conn:
            return load_graph(conn, graph_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{graph_id}/sync", response_model=SyncResponse)
def sync_graph(graph_id: UUID, body: SyncFullRequest) -> SyncResponse:
    payload = body.payload
    payload.graph_id = graph_id
    try:
        with db_transaction() as conn:
            return apply_full_sync(conn, payload)
    except VersionConflictError as e:
        raise HTTPException(
            status_code=409,
            detail={"message": str(e), "expected": e.expected, "actual": e.actual},
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{graph_id}/sync/canvas", response_model=SyncResponse)
def sync_from_canvas(
    graph_id: UUID,
    body: dict,
) -> SyncResponse:
    """Accept ``{ x6Json, baseVersion?, clientId?, legacyTables?, operationSource? }`` from frontend."""
    x6 = body.get("x6Json") or body.get("x6_json") or {}
    base_version = body.get("baseVersion") or body.get("base_version")
    client_id = body.get("clientId") or body.get("client_id")
    legacy = body.get("legacyTables") or body.get("legacy_tables")
    operation_source = body.get("operationSource") or body.get("operation_source") or "auto_save"
    allowed_sources = {"manual_save", "auto_save", "undo", "redo", "restore"}
    if operation_source not in allowed_sources:
        operation_source = "auto_save"

    if legacy:
        from app.services.normalize import is_edge_cell, is_table_cell

        snap_nodes: list = []
        snap_edges: list = []
        if x6.get("cells"):
            snap_nodes = [c for c in x6["cells"] if is_table_cell(c)]
            snap_edges = [c for c in x6["cells"] if is_edge_cell(c)]
        else:
            snap_nodes = [c for c in (x6.get("nodes") or []) if is_table_cell(c)]
            snap_edges = [c for c in (x6.get("edges") or []) if is_edge_cell(c)]
        snapshot = (
            CanvasSnapshotPayload(nodes=snap_nodes, edges=snap_edges)
            if snap_nodes or snap_edges
            else None
        )
        payload = normalize_legacy_tables_array(
            graph_id,
            legacy,
            snapshot=snapshot,
            base_version=base_version,
        )
        payload.client_id = client_id
        payload.operation_source = operation_source
    else:
        payload = normalize_from_canvas(
            graph_id, x6, base_version=base_version, client_id=client_id
        )
        payload.operation_source = operation_source

    try:
        with db_transaction() as conn:
            return apply_full_sync(conn, payload)
    except VersionConflictError as e:
        raise HTTPException(
            status_code=409,
            detail={"message": str(e), "expected": e.expected, "actual": e.actual},
        ) from e


@router.post("/{graph_id}/normalize", response_model=NormalizedGraphPayload)
def normalize_preview(graph_id: UUID, body: dict) -> NormalizedGraphPayload:
    x6 = body.get("x6Json") or body.get("x6_json") or {}
    legacy = body.get("legacyTables") or body.get("legacy_tables")
    if legacy and not x6.get("cells") and not x6.get("nodes"):
        return normalize_legacy_tables_array(graph_id, legacy)
    return normalize_from_canvas(graph_id, x6)


@router.get("/{graph_id}/agent-context", response_model=AgentContextResponse)
def agent_context(graph_id: UUID, q: str | None = None) -> AgentContextResponse:
    with get_connection() as conn:
        with conn.cursor() as cur:
            try:
                data = build_agent_context(cur, graph_id, q)
            except ValueError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
    return AgentContextResponse(
        graph_id=graph_id,
        version=data["version"],
        text=data["text"],
        documents=data["documents"],
    )


@router.post("/{graph_id}/sync/changes", response_model=SyncResponse)
def sync_graph_changes(graph_id: UUID, body: SyncChangesRequest) -> SyncResponse:
    body.graph_id = graph_id
    try:
        with db_transaction() as conn:
            return graph_sync_service.sync_changes(
                conn,
                graph_id,
                body.changes,
                client_id=body.client_id,
                base_version=body.base_version,
            )
    except VersionConflictError as e:
        raise HTTPException(
            status_code=409,
            detail={"message": str(e), "expected": e.expected, "actual": e.actual},
        ) from e


@router.get("/{graph_id}/history", response_model=HistoryResponse)
def graph_history(graph_id: UUID, limit: int = 100) -> HistoryResponse:
    with get_connection() as conn:
        with conn.cursor() as cur:
            try:
                return list_change_history(cur, graph_id, limit=limit)
            except ValueError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{graph_id}/restore", response_model=RestoreResponse)
def graph_restore(graph_id: UUID, body: RestoreRequest) -> RestoreResponse:
    try:
        with db_transaction() as conn:
            return restore_from_change_log(
                conn,
                graph_id,
                body.change_log_id,
            )
    except VersionConflictError as e:
        raise HTTPException(
            status_code=409,
            detail={"message": str(e), "expected": e.expected, "actual": e.actual},
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/default/id")
def default_graph_id() -> dict[str, str]:
    return {"graph_id": get_settings().default_graph_id}
