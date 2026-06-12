from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from psycopg.types.json import Jsonb

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
    GraphCreateRequest,
    GraphLoadResponse,
    GraphMemberResponse,
    GraphMemberUpsertRequest,
    GraphMetaResponse,
    GraphRole,
    GraphUpdateRequest,
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
    ensure_product_role,
    get_current_user_from_header,
)
from app.services.history import list_change_history
from app.services.load import load_graph
from app.services.normalize import normalize_from_canvas, normalize_legacy_tables_array
from app.services.restore import restore_from_change_log
from app.services.sync import VersionConflictError, apply_full_sync

router = APIRouter(prefix="/graphs", tags=["graphs"])


def _graph_meta_response(row: dict, current_user_role: GraphRole | None = None) -> GraphMetaResponse:
    return GraphMetaResponse(
        id=row["id"],
        product_id=row.get("product_id"),
        product_code=row.get("product_code"),
        product_name=row.get("product_name"),
        name=row["name"],
        description=row["description"],
        business_domain=row["business_domain"],
        version=row["version"],
        collab_revision=row["collab_revision"],
        status=row["status"],
        updated_at=row.get("updated_at"),
        table_count=row.get("table_count") or 0,
        relation_count=row.get("relation_count") or 0,
        current_user_role=current_user_role or row.get("current_user_role"),
    )


GRAPH_META_SELECT = """
WITH table_counts AS (
    SELECT graph_id, COUNT(*) AS table_count
    FROM er_table
    WHERE deleted_at IS NULL
    GROUP BY graph_id
),
relation_counts AS (
    SELECT graph_id, COUNT(*) AS relation_count
    FROM er_relation
    WHERE deleted_at IS NULL
    GROUP BY graph_id
)
SELECT g.id, g.product_id, p.code AS product_code, p.name AS product_name,
       g.name, g.description, g.business_domain,
       g.version, g.collab_revision, g.status, g.updated_at,
       COALESCE(tc.table_count, 0) AS table_count,
       COALESCE(rc.relation_count, 0) AS relation_count
FROM er_graph g
LEFT JOIN product p ON p.id = g.product_id
LEFT JOIN table_counts tc ON tc.graph_id = g.id
LEFT JOIN relation_counts rc ON rc.graph_id = g.id
WHERE g.id = %s
"""


def _fetch_graph_meta(
    cur,
    graph_id: UUID,
    current_user_role: GraphRole | None = None,
) -> GraphMetaResponse:
    cur.execute(GRAPH_META_SELECT, (graph_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"graph not found: {graph_id}")
    return _graph_meta_response(row, current_user_role=current_user_role)


def _ensure_active_graph(cur, graph_id: UUID) -> None:
    cur.execute("SELECT status FROM er_graph WHERE id = %s", (graph_id,))
    row = cur.fetchone()
    if not row or row["status"] == "archived":
        raise HTTPException(status_code=404, detail=f"graph not found: {graph_id}")


def _owner_count(cur, graph_id: UUID) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS n
        FROM er_graph_member
        WHERE graph_id = %s AND role = 'owner'
        """,
        (graph_id,),
    )
    return int(cur.fetchone()["n"])


def _member_response(row: dict) -> GraphMemberResponse:
    return GraphMemberResponse(
        user_id=row["user_id"],
        email=row["email"],
        display_name=row["display_name"],
        role=row["role"],
        created_at=row["created_at"],
        is_creator=bool(row.get("is_creator")),
    )


def _fetch_graph_member(cur, graph_id: UUID, user_id: UUID) -> GraphMemberResponse:
    cur.execute(
        """
        SELECT m.user_id, u.email, u.display_name, m.role, m.created_at,
               (g.created_by = m.user_id::text) AS is_creator
        FROM er_graph_member m
        JOIN app_user u ON u.id = m.user_id
        JOIN er_graph g ON g.id = m.graph_id
        WHERE m.graph_id = %s AND m.user_id = %s
        """,
        (graph_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="graph member not found")
    return _member_response(row)


def _default_product_id() -> UUID:
    return UUID(get_settings().default_product_id)


@router.get("", response_model=list[GraphMetaResponse])
def list_graphs(
    product_id: UUID | None = None,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[GraphMetaResponse]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH table_counts AS (
                    SELECT graph_id, COUNT(*) AS table_count
                    FROM er_table
                    WHERE deleted_at IS NULL
                    GROUP BY graph_id
                ),
                relation_counts AS (
                    SELECT graph_id, COUNT(*) AS relation_count
                    FROM er_relation
                    WHERE deleted_at IS NULL
                    GROUP BY graph_id
                )
                SELECT g.id, g.product_id, p.code AS product_code, p.name AS product_name,
                       g.name, g.description, g.business_domain,
                       g.version, g.collab_revision, g.status, g.updated_at,
                       CASE GREATEST(
                            COALESCE(CASE gm.role
                                WHEN 'owner' THEN 3
                                WHEN 'editor' THEN 2
                                WHEN 'viewer' THEN 1
                                ELSE 0
                            END, 0),
                            COALESCE(CASE pm.role
                                WHEN 'owner' THEN 3
                                WHEN 'editor' THEN 2
                                WHEN 'viewer' THEN 1
                                ELSE 0
                            END, 0)
                       )
                         WHEN 3 THEN 'owner'
                         WHEN 2 THEN 'editor'
                         WHEN 1 THEN 'viewer'
                         ELSE NULL
                       END AS current_user_role,
                       COALESCE(tc.table_count, 0) AS table_count,
                       COALESCE(rc.relation_count, 0) AS relation_count
                FROM er_graph g
                LEFT JOIN product p ON p.id = g.product_id
                LEFT JOIN er_graph_member gm
                  ON gm.graph_id = g.id AND gm.user_id = %s
                LEFT JOIN product_member pm
                  ON pm.product_id = g.product_id AND pm.user_id = %s
                LEFT JOIN table_counts tc ON tc.graph_id = g.id
                LEFT JOIN relation_counts rc ON rc.graph_id = g.id
                WHERE (gm.user_id IS NOT NULL OR pm.user_id IS NOT NULL)
                  AND g.status <> 'archived'
                  AND (%s::uuid IS NULL OR g.product_id = %s)
                ORDER BY g.name
                """,
                (user.id, user.id, product_id, product_id),
            )
            rows = cur.fetchall()
    return [_graph_meta_response(r) for r in rows]


@router.post("", response_model=GraphMetaResponse)
def create_graph(
    body: GraphCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> GraphMetaResponse:
    name = (body.name or "").strip() or "新建 ER 图"
    product_id = body.product_id or _default_product_id()
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_product_role(cur, product_id, user.id, "editor")
            cur.execute(
                """
                INSERT INTO er_graph (
                    product_id, name, description, business_domain, created_by, updated_by
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, product_id, name, description, business_domain,
                          version, collab_revision, status, updated_at
                """,
                (
                    product_id,
                    name,
                    body.description,
                    body.business_domain,
                    str(user.id),
                    str(user.id),
                ),
            )
            graph = cur.fetchone()
            cur.execute(
                """
                INSERT INTO er_graph_snapshot (graph_id, x6_json, business_json)
                VALUES (%s, %s, %s)
                """,
                (
                    graph["id"],
                    Jsonb({"nodes": [], "edges": []}),
                    Jsonb([]),
                ),
            )
            cur.execute(
                """
                INSERT INTO er_graph_member (graph_id, user_id, role)
                VALUES (%s, %s, 'owner')
                ON CONFLICT (graph_id, user_id) DO UPDATE SET role = 'owner'
                """,
                (graph["id"], user.id),
            )
    return _graph_meta_response(
        {**graph, "table_count": 0, "relation_count": 0},
        current_user_role="owner",
    )


@router.patch("/{graph_id}/meta", response_model=GraphMetaResponse)
def update_graph_meta(
    graph_id: UUID,
    body: GraphUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> GraphMetaResponse:
    fields_set = body.model_fields_set
    updates: dict[str, str | None] = {}
    if "name" in fields_set:
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="graph name cannot be empty")
        updates["name"] = name
    if "description" in fields_set:
        updates["description"] = (body.description or "").strip() or None
    if "business_domain" in fields_set:
        updates["business_domain"] = (body.business_domain or "").strip() or None

    with db_transaction() as conn:
        with conn.cursor() as cur:
            role = ensure_graph_role(cur, graph_id, user.id, "editor")
            if updates:
                assignments = [f"{field} = %s" for field in updates]
                values = [*updates.values(), str(user.id), graph_id]
                cur.execute(
                    f"""
                    UPDATE er_graph
                    SET {", ".join(assignments)}, updated_by = %s, updated_at = NOW()
                    WHERE id = %s AND status <> 'archived'
                    """,
                    values,
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail=f"graph not found: {graph_id}")
            return _fetch_graph_meta(cur, graph_id, current_user_role=role)


@router.delete("/{graph_id}", response_model=GraphMetaResponse)
def archive_graph(
    graph_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> GraphMetaResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            role = ensure_graph_role(cur, graph_id, user.id, "owner")
            cur.execute(
                """
                UPDATE er_graph
                SET status = 'archived', updated_by = %s, updated_at = NOW()
                WHERE id = %s AND status <> 'archived'
                """,
                (str(user.id), graph_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail=f"graph not found: {graph_id}")
            return _fetch_graph_meta(cur, graph_id, current_user_role=role)


@router.get("/{graph_id}/members", response_model=list[GraphMemberResponse])
def list_graph_members(
    graph_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[GraphMemberResponse]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_graph_role(cur, graph_id, user.id, "owner")
            _ensure_active_graph(cur, graph_id)
            cur.execute(
                """
                SELECT m.user_id, u.email, u.display_name, m.role, m.created_at,
                       (g.created_by = m.user_id::text) AS is_creator
                FROM er_graph_member m
                JOIN app_user u ON u.id = m.user_id
                JOIN er_graph g ON g.id = m.graph_id
                WHERE m.graph_id = %s
                ORDER BY m.created_at ASC, lower(u.email)
                """,
                (graph_id,),
            )
            return [_member_response(row) for row in cur.fetchall()]


@router.put("/{graph_id}/members", response_model=GraphMemberResponse)
def upsert_graph_member(
    graph_id: UUID,
    body: GraphMemberUpsertRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> GraphMemberResponse:
    email = body.email.strip().lower()
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_graph_role(cur, graph_id, user.id, "owner")
            _ensure_active_graph(cur, graph_id)
            cur.execute(
                """
                SELECT id
                FROM app_user
                WHERE lower(email) = %s AND status = 'active'
                """,
                (email,),
            )
            target = cur.fetchone()
            if not target:
                raise HTTPException(status_code=404, detail="active user not found")
            target_user_id = target["id"]
            cur.execute(
                """
                SELECT created_by
                FROM er_graph
                WHERE id = %s AND status <> 'archived'
                """,
                (graph_id,),
            )
            graph_row = cur.fetchone()
            if not graph_row:
                raise HTTPException(status_code=404, detail=f"graph not found: {graph_id}")
            if graph_row["created_by"] == str(target_user_id) and body.role != "owner":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="graph creator must remain owner",
                )
            cur.execute(
                """
                SELECT role
                FROM er_graph_member
                WHERE graph_id = %s AND user_id = %s
                """,
                (graph_id, target_user_id),
            )
            existing = cur.fetchone()
            if (
                existing
                and existing["role"] == "owner"
                and body.role != "owner"
                and _owner_count(cur, graph_id) <= 1
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot demote the last owner",
                )
            cur.execute(
                """
                INSERT INTO er_graph_member (graph_id, user_id, role)
                VALUES (%s, %s, %s)
                ON CONFLICT (graph_id, user_id)
                DO UPDATE SET role = EXCLUDED.role
                """,
                (graph_id, target_user_id, body.role),
            )
            return _fetch_graph_member(cur, graph_id, target_user_id)


@router.delete("/{graph_id}/members/{member_user_id}", response_model=GraphMemberResponse)
def remove_graph_member(
    graph_id: UUID,
    member_user_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> GraphMemberResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_graph_role(cur, graph_id, user.id, "owner")
            _ensure_active_graph(cur, graph_id)
            member = _fetch_graph_member(cur, graph_id, member_user_id)
            if member.is_creator:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="graph creator cannot be removed",
                )
            if member.role == "owner" and _owner_count(cur, graph_id) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot remove the last owner",
                )
            cur.execute(
                """
                DELETE FROM er_graph_member
                WHERE graph_id = %s AND user_id = %s
                """,
                (graph_id, member_user_id),
            )
            return member


@router.get("/{graph_id}", response_model=GraphLoadResponse)
def get_graph(
    graph_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> GraphLoadResponse:
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                role = ensure_graph_role(cur, graph_id, user.id, "viewer")
            loaded = load_graph(conn, graph_id)
            loaded.graph.current_user_role = role
            return loaded
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/{graph_id}/meta", response_model=GraphMetaResponse)
def get_graph_meta(
    graph_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> GraphMetaResponse:
    with get_connection() as conn:
        with conn.cursor() as cur:
            role = ensure_graph_role(cur, graph_id, user.id, "viewer")
            return _fetch_graph_meta(cur, graph_id, current_user_role=role)


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
