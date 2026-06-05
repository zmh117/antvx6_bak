from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException

from app.application.graph_sync import graph_sync_service
from app.application.er_import_service import er_import_service
from app.config import get_settings
from app.database import db_transaction, get_connection
from app.domain.er_import import ImportMode
from app.interfaces.http.schemas.database_connection import (
    ImportDatabaseRequest,
    ImportDatabaseResponse,
)
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
from app.services.auth import (
    AuthenticatedUser,
    ensure_graph_role,
    ensure_internal_token,
    get_current_user_from_header,
)
from app.services.history import list_change_history
from app.services.load import load_graph
from app.services.normalize import normalize_from_canvas, normalize_legacy_tables_array
from app.services.restore import restore_from_change_log
from app.services.sync import VersionConflictError, apply_full_sync

router = APIRouter(prefix="/graphs", tags=["graphs"])


@router.get("", response_model=list[GraphMetaResponse])
def list_graphs(user: AuthenticatedUser = Depends(get_current_user_from_header)) -> list[GraphMetaResponse]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT g.id, g.name, g.description, g.business_domain,
                       g.version, g.collab_revision, g.status, g.updated_at,
                       COUNT(DISTINCT t.table_key) AS table_count,
                       COUNT(DISTINCT r.relation_key) AS relation_count
                FROM er_graph g
                JOIN er_graph_member m ON m.graph_id = g.id
                LEFT JOIN er_table t ON t.graph_id = g.id AND t.deleted_at IS NULL
                LEFT JOIN er_relation r ON r.graph_id = g.id AND r.deleted_at IS NULL
                WHERE m.user_id = %s
                GROUP BY g.id, g.name, g.description, g.business_domain,
                         g.version, g.collab_revision, g.status, g.updated_at
                ORDER BY g.name
                """,
                (user.id,),
            )
            rows = cur.fetchall()
    return [
        GraphMetaResponse(
            id=r["id"],
            name=r["name"],
            description=r["description"],
            business_domain=r["business_domain"],
            version=r["version"],
            collab_revision=r["collab_revision"],
            status=r["status"],
            updated_at=r["updated_at"],
            table_count=r["table_count"] or 0,
            relation_count=r["relation_count"] or 0,
        )
        for r in rows
    ]


@router.get("/{graph_id}", response_model=GraphLoadResponse)
def get_graph(
    graph_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> GraphLoadResponse:
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                ensure_graph_role(cur, graph_id, user.id, "viewer")
            return load_graph(conn, graph_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/{graph_id}/meta", response_model=GraphMetaResponse)
def get_graph_meta(
    graph_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> GraphMetaResponse:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_graph_role(cur, graph_id, user.id, "viewer")
            cur.execute(
                """
                SELECT g.id, g.name, g.description, g.business_domain,
                       g.version, g.collab_revision, g.status, g.updated_at,
                       COUNT(DISTINCT t.table_key) AS table_count,
                       COUNT(DISTINCT r.relation_key) AS relation_count
                FROM er_graph g
                LEFT JOIN er_table t ON t.graph_id = g.id AND t.deleted_at IS NULL
                LEFT JOIN er_relation r ON r.graph_id = g.id AND r.deleted_at IS NULL
                WHERE g.id = %s
                GROUP BY g.id, g.name, g.description, g.business_domain,
                         g.version, g.collab_revision, g.status, g.updated_at
                """,
                (graph_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"graph not found: {graph_id}")
            return GraphMetaResponse(
                id=row["id"],
                name=row["name"],
                description=row["description"],
                business_domain=row["business_domain"],
                version=row["version"],
                collab_revision=row["collab_revision"],
                status=row["status"],
                updated_at=row["updated_at"],
                table_count=row["table_count"] or 0,
                relation_count=row["relation_count"] or 0,
            )


@router.post("/{graph_id}/sync", response_model=SyncResponse)
def sync_graph(
    graph_id: UUID,
    body: SyncFullRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> SyncResponse:
    payload = body.payload
    payload.graph_id = graph_id
    try:
        with db_transaction() as conn:
            with conn.cursor() as cur:
                ensure_graph_role(cur, graph_id, user.id, "editor")
            return apply_full_sync(conn, payload, user_id=user.id)
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
    user: AuthenticatedUser = Depends(get_current_user_from_header),
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
            with conn.cursor() as cur:
                ensure_graph_role(cur, graph_id, user.id, "editor")
            return apply_full_sync(conn, payload, user_id=user.id)
    except VersionConflictError as e:
        raise HTTPException(
            status_code=409,
            detail={"message": str(e), "expected": e.expected, "actual": e.actual},
        ) from e


@router.post("/{graph_id}/normalize", response_model=NormalizedGraphPayload)
def normalize_preview(
    graph_id: UUID,
    body: dict,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> NormalizedGraphPayload:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_graph_role(cur, graph_id, user.id, "viewer")
    x6 = body.get("x6Json") or body.get("x6_json") or {}
    legacy = body.get("legacyTables") or body.get("legacy_tables")
    if legacy and not x6.get("cells") and not x6.get("nodes"):
        return normalize_legacy_tables_array(graph_id, legacy)
    return normalize_from_canvas(graph_id, x6)


@router.get("/{graph_id}/agent-context", response_model=AgentContextResponse)
def agent_context(
    graph_id: UUID,
    q: str | None = None,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> AgentContextResponse:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_graph_role(cur, graph_id, user.id, "viewer")
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
def sync_graph_changes(
    graph_id: UUID,
    body: SyncChangesRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> SyncResponse:
    body.graph_id = graph_id
    try:
        with db_transaction() as conn:
            with conn.cursor() as cur:
                ensure_graph_role(cur, graph_id, user.id, "editor")
            return graph_sync_service.sync_changes(
                conn,
                graph_id,
                body.changes,
                client_id=body.client_id,
                base_version=body.base_version,
                user_id=user.id,
            )
    except VersionConflictError as e:
        raise HTTPException(
            status_code=409,
            detail={"message": str(e), "expected": e.expected, "actual": e.actual},
        ) from e


@router.get("/{graph_id}/history", response_model=HistoryResponse)
def graph_history(
    graph_id: UUID,
    limit: int = 100,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> HistoryResponse:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_graph_role(cur, graph_id, user.id, "viewer")
            try:
                return list_change_history(cur, graph_id, limit=limit)
            except ValueError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{graph_id}/restore", response_model=RestoreResponse)
def graph_restore(
    graph_id: UUID,
    body: RestoreRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> RestoreResponse:
    try:
        with db_transaction() as conn:
            with conn.cursor() as cur:
                ensure_graph_role(cur, graph_id, user.id, "editor")
            return restore_from_change_log(
                conn,
                graph_id,
                body.change_log_id,
                client_id=str(user.id),
                user_id=user.id,
            )
    except VersionConflictError as e:
        raise HTTPException(
            status_code=409,
            detail={"message": str(e), "expected": e.expected, "actual": e.actual},
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{graph_id}/import/database", response_model=ImportDatabaseResponse)
def import_graph_from_database(
    graph_id: UUID,
    body: ImportDatabaseRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> ImportDatabaseResponse:
    selected = {name.strip() for name in body.selected_tables if name.strip()}
    if not selected:
        raise HTTPException(status_code=400, detail="selected_tables cannot be empty")
    try:
        with db_transaction() as conn:
            with conn.cursor() as cur:
                ensure_graph_role(cur, graph_id, user.id, "editor")
            result = er_import_service.import_database(
                conn,
                graph_id=graph_id,
                connection_id=body.connection_id,
                mode=ImportMode(body.mode),
                selected_tables=selected,
                user_id=user.id,
            )
            return ImportDatabaseResponse(
                ok=result.ok,
                graph_id=result.graph_id,
                new_version=result.new_version,
                warnings=result.warnings,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/default/id")
def default_graph_id() -> dict[str, str]:
    return {"graph_id": get_settings().default_graph_id}


@router.post("/{graph_id}/internal/materialize", response_model=SyncResponse)
def materialize_from_collab(
    graph_id: UUID,
    body: dict,
    x_internal_token: str | None = Header(default=None),
) -> SyncResponse:
    """Internal endpoint used by the Hocuspocus sidecar to materialize Y.Doc state."""
    ensure_internal_token(x_internal_token)
    incoming_revision = body.get("collabRevision") or body.get("collab_revision")
    x6 = body.get("x6Json") or body.get("x6_json") or {}
    legacy = body.get("legacyTables") or body.get("legacy_tables") or []
    client_id = body.get("clientId") or body.get("client_id") or "collab-sidecar"
    user_id = body.get("userId") or body.get("user_id")
    snapshot = None
    if x6.get("nodes") or x6.get("edges") or x6.get("cells"):
        from app.services.normalize import is_edge_cell, is_table_cell

        cells = x6.get("cells") or [*(x6.get("nodes") or []), *(x6.get("edges") or [])]
        snapshot = CanvasSnapshotPayload(
            nodes=[c for c in cells if is_table_cell(c)],
            edges=[c for c in cells if is_edge_cell(c)],
        )
    payload = normalize_legacy_tables_array(
        graph_id,
        legacy,
        snapshot=snapshot,
        base_version=None,
    )
    payload.client_id = client_id
    payload.operation_source = body.get("operationSource") or "collab_auto_save"
    try:
        with db_transaction() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT collab_revision FROM er_graph WHERE id = %s",
                    (graph_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail=f"graph not found: {graph_id}")
                current_revision = int(row["collab_revision"])
            try:
                parsed_revision = int(incoming_revision)
            except (TypeError, ValueError) as e:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "missing or invalid collab_revision",
                        "expected": current_revision,
                        "actual": incoming_revision,
                    },
                ) from e
            if parsed_revision != current_revision:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "stale collab document",
                        "expected": current_revision,
                        "actual": parsed_revision,
                    },
                )
            return apply_full_sync(conn, payload, user_id=user_id)
    except VersionConflictError as e:
        raise HTTPException(
            status_code=409,
            detail={"message": str(e), "expected": e.expected, "actual": e.actual},
        ) from e
