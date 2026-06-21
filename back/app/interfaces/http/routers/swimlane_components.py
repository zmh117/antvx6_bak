from __future__ import annotations

import hashlib
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg.types.json import Jsonb

from app.database import db_transaction, get_connection
from app.interfaces.http.schemas.business_flow import (
    SwimlaneComponentCreateRequest,
    SwimlaneComponentResponse,
    SwimlaneComponentUpdateRequest,
    SwimlaneComponentVersionSaveRequest,
)
from app.services.auth import (
    AuthenticatedUser,
    ensure_product_role,
    get_current_user_from_header,
)

router = APIRouter(tags=["swimlane-components"])


def _component_product_id(cur, component_id: UUID) -> UUID:
    cur.execute(
        """
        SELECT product_id
        FROM swimlane_component
        WHERE id = %s AND deleted_at IS NULL AND status <> 'ARCHIVED'
        """,
        (component_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"swimlane component not found: {component_id}",
        )
    return row["product_id"]


def _node_response(row: dict) -> dict:
    return {
        **row,
        "position_x": float(row["position_x"]),
        "position_y": float(row["position_y"]),
        "width": float(row["width"]),
        "height": float(row["height"]),
        "er_refs": row.get("er_refs") or [],
        "mes_semantics_json": row.get("mes_semantics_json") or {},
        "style_json": row.get("style_json") or {},
        "properties_json": row.get("properties_json") or {},
    }


def _edge_response(row: dict) -> dict:
    return {
        **row,
        "data_contract_json": row.get("data_contract_json") or {},
        "mes_semantics_json": row.get("mes_semantics_json") or {},
        "style_json": row.get("style_json") or {},
        "properties_json": row.get("properties_json") or {},
    }


def _component_node_er_refs_by_node_id(
    cur,
    node_ids: list[UUID],
) -> dict[UUID, list[dict]]:
    if not node_ids:
        return {}
    cur.execute(
        """
        SELECT id, swimlane_component_node_id, er_diagram_id, er_table_key,
               er_column_key, ref_type, description
        FROM swimlane_component_node_er_ref
        WHERE swimlane_component_node_id = ANY(%s)
        ORDER BY created_at ASC, er_table_key ASC, er_column_key ASC
        """,
        (node_ids,),
    )
    refs_by_node_id: dict[UUID, list[dict]] = {}
    for ref in cur.fetchall():
        refs_by_node_id.setdefault(ref["swimlane_component_node_id"], []).append(
            {
                "id": ref["id"],
                "er_diagram_id": ref["er_diagram_id"],
                "er_table_key": ref["er_table_key"],
                "er_column_key": ref["er_column_key"],
                "ref_type": ref["ref_type"],
                "description": ref["description"],
            }
        )
    return refs_by_node_id


def _fetch_component(cur, component_id: UUID) -> SwimlaneComponentResponse:
    cur.execute(
        """
        SELECT sc.id, sc.product_id, p.code AS product_code, p.name AS product_name,
               sc.code, sc.name, sc.category, sc.owner_role, sc.description,
               sc.status, sc.current_version_no, sc.created_at, sc.updated_at
        FROM swimlane_component sc
        JOIN product p ON p.id = sc.product_id
        WHERE sc.id = %s AND sc.deleted_at IS NULL
        """,
        (component_id,),
    )
    component = cur.fetchone()
    if not component:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"swimlane component not found: {component_id}",
        )

    cur.execute(
        """
        SELECT id, component_id, version_no, version_name, canvas_json, semantic_json,
               thumbnail_url, status, checksum, created_at, published_at
        FROM swimlane_component_version
        WHERE component_id = %s
        ORDER BY version_no ASC
        """,
        (component_id,),
    )
    versions = []
    for version in cur.fetchall():
        cur.execute(
            """
            SELECT id, component_version_id, node_key, node_type, title, description,
                   actor, business_rule, input_summary, output_summary,
                   bpmn_element_type, bpmn_event_kind, bpmn_event_definition,
                   bpmn_task_type, bpmn_gateway_type, bpmn_subprocess_kind,
                   bpmn_call_activity_ref, bpmn_boundary_attached_to_node_key,
                   mes_semantics_json,
                   position_x, position_y, width, height, style_json, properties_json
            FROM swimlane_component_node
            WHERE component_version_id = %s
            ORDER BY created_at ASC, node_key ASC
            """,
            (version["id"],),
        )
        node_rows = cur.fetchall()
        refs_by_node_id = _component_node_er_refs_by_node_id(
            cur,
            [row["id"] for row in node_rows],
        )
        nodes = [
            _node_response({**row, "er_refs": refs_by_node_id.get(row["id"], [])})
            for row in node_rows
        ]
        cur.execute(
            """
            SELECT id, component_version_id, edge_key, source_node_key, target_node_key,
                   source_port, target_port, edge_type, label, condition_text,
                   bpmn_flow_type, bpmn_sequence_flow_kind, bpmn_message_name,
                   bpmn_condition_expression, data_contract_json, mes_semantics_json,
                   style_json, properties_json
            FROM swimlane_component_edge
            WHERE component_version_id = %s
            ORDER BY created_at ASC, edge_key ASC
            """,
            (version["id"],),
        )
        edges = [_edge_response(row) for row in cur.fetchall()]
        versions.append(
            {
                **version,
                "created_at": version["created_at"].isoformat(),
                "published_at": version["published_at"].isoformat()
                if version.get("published_at")
                else None,
                "canvas_json": version.get("canvas_json") or {},
                "semantic_json": version.get("semantic_json") or {},
                "nodes": nodes,
                "edges": edges,
            }
        )

    return SwimlaneComponentResponse(
        **{
            **component,
            "created_at": component["created_at"].isoformat(),
            "updated_at": component["updated_at"].isoformat(),
            "versions": versions,
        }
    )


def _checksum_payload(body: SwimlaneComponentVersionSaveRequest) -> str:
    payload = {
        "canvas_json": body.canvas_json,
        "semantic_json": body.semantic_json,
        "nodes": [node.model_dump(mode="json") for node in body.nodes],
        "edges": [edge.model_dump(mode="json") for edge in body.edges],
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _validate_component_graph(body: SwimlaneComponentVersionSaveRequest) -> None:
    node_keys = [node.node_key for node in body.nodes]
    if len(node_keys) != len(set(node_keys)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="duplicate component node_key")
    edge_keys = [edge.edge_key for edge in body.edges]
    if len(edge_keys) != len(set(edge_keys)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="duplicate component edge_key")
    node_key_set = set(node_keys)
    for edge in body.edges:
        if edge.source_node_key not in node_key_set or edge.target_node_key not in node_key_set:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"component edge endpoint is missing: {edge.edge_key}",
            )


def _insert_version_payload(
    cur,
    component_id: UUID,
    version_no: int,
    version_status: str,
    body: SwimlaneComponentVersionSaveRequest,
    user_id: UUID,
    published: bool = False,
) -> UUID:
    _validate_component_graph(body)
    cur.execute(
        """
        INSERT INTO swimlane_component_version (
            component_id, version_no, version_name, canvas_json, semantic_json,
            thumbnail_url, status, checksum, created_by, published_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CASE WHEN %s THEN NOW() ELSE NULL END)
        RETURNING id
        """,
        (
            component_id,
            version_no,
            body.name or f"v{version_no}",
            Jsonb(body.canvas_json),
            Jsonb(body.semantic_json),
            body.thumbnail_url,
            version_status,
            _checksum_payload(body),
            str(user_id),
            published,
        ),
    )
    version_id = cur.fetchone()["id"]
    for node in body.nodes:
        cur.execute(
            """
            INSERT INTO swimlane_component_node (
                component_version_id, node_key, node_type, title, description,
                actor, business_rule, input_summary, output_summary,
                bpmn_element_type, bpmn_event_kind, bpmn_event_definition,
                bpmn_task_type, bpmn_gateway_type, bpmn_subprocess_kind,
                bpmn_call_activity_ref, bpmn_boundary_attached_to_node_key,
                mes_semantics_json,
                position_x, position_y, width, height, style_json, properties_json
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                version_id,
                node.node_key,
                node.node_type,
                node.title,
                node.description,
                node.actor,
                node.business_rule,
                node.input_summary,
                node.output_summary,
                node.bpmn_element_type,
                node.bpmn_event_kind,
                node.bpmn_event_definition,
                node.bpmn_task_type,
                node.bpmn_gateway_type,
                node.bpmn_subprocess_kind,
                node.bpmn_call_activity_ref,
                node.bpmn_boundary_attached_to_node_key,
                Jsonb(node.mes_semantics_json),
                node.position_x,
                node.position_y,
                node.width,
                node.height,
                Jsonb(node.style_json),
                Jsonb(node.properties_json),
            ),
        )
        node_id = cur.fetchone()["id"]
        for ref in node.er_refs:
            cur.execute(
                """
                INSERT INTO swimlane_component_node_er_ref (
                    component_version_id, swimlane_component_node_id, er_diagram_id,
                    er_table_key, er_column_key, ref_type, description, created_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    version_id,
                    node_id,
                    ref.er_diagram_id,
                    ref.er_table_key,
                    ref.er_column_key,
                    ref.ref_type,
                    ref.description,
                    str(user_id),
                ),
            )
    for edge in body.edges:
        cur.execute(
            """
            INSERT INTO swimlane_component_edge (
                component_version_id, edge_key, source_node_key, target_node_key,
                source_port, target_port, edge_type, label, condition_text,
                bpmn_flow_type, bpmn_sequence_flow_kind, bpmn_message_name,
                bpmn_condition_expression, data_contract_json, mes_semantics_json,
                style_json, properties_json
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                version_id,
                edge.edge_key,
                edge.source_node_key,
                edge.target_node_key,
                edge.source_port,
                edge.target_port,
                edge.edge_type,
                edge.label,
                edge.condition_text,
                edge.bpmn_flow_type,
                edge.bpmn_sequence_flow_kind,
                edge.bpmn_message_name,
                edge.bpmn_condition_expression,
                Jsonb(edge.data_contract_json),
                Jsonb(edge.mes_semantics_json),
                Jsonb(edge.style_json),
                Jsonb(edge.properties_json),
            ),
        )
    return version_id


def _metadata_updates_from_version_body(body: SwimlaneComponentVersionSaveRequest) -> dict[str, str | None]:
    metadata_updates: dict[str, str | None] = {}
    if body.name is not None:
        metadata_updates["name"] = body.name.strip()
    if body.category is not None:
        metadata_updates["category"] = body.category.strip() or None
    if body.owner_role is not None:
        metadata_updates["owner_role"] = body.owner_role.strip() or None
    if body.description is not None:
        metadata_updates["description"] = body.description.strip() or None
    return metadata_updates


def _insert_empty_draft_version(cur, component_id: UUID, user_id: UUID) -> None:
    cur.execute(
        """
        INSERT INTO swimlane_component_version (
            component_id, version_no, version_name, status, created_by
        )
        VALUES (%s, 1, 'v1 draft', 'DRAFT', %s)
        """,
        (component_id, str(user_id)),
    )


@router.get("/swimlane-components", response_model=list[SwimlaneComponentResponse])
@router.get("/products/{path_product_id}/swimlane-components", response_model=list[SwimlaneComponentResponse])
def list_swimlane_components(
    path_product_id: UUID | None = None,
    product_id: UUID | None = None,
    component_status: str | None = Query(default=None, alias="status"),
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[SwimlaneComponentResponse]:
    effective_product_id = path_product_id or product_id
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT sc.id
                FROM swimlane_component sc
                JOIN product_member pm
                  ON pm.product_id = sc.product_id AND pm.user_id = %s
                WHERE sc.deleted_at IS NULL
                  AND sc.status <> 'ARCHIVED'
                  AND (%s::uuid IS NULL OR sc.product_id = %s)
                  AND (%s::text IS NULL OR sc.status = %s)
                ORDER BY sc.updated_at DESC, lower(sc.name)
                """,
                (
                    user.id,
                    effective_product_id,
                    effective_product_id,
                    component_status,
                    component_status,
                ),
            )
            return [_fetch_component(cur, row["id"]) for row in cur.fetchall()]


@router.post("/swimlane-components", response_model=SwimlaneComponentResponse)
@router.post("/products/{path_product_id}/swimlane-components", response_model=SwimlaneComponentResponse)
def create_swimlane_component(
    body: SwimlaneComponentCreateRequest,
    path_product_id: UUID | None = None,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> SwimlaneComponentResponse:
    product_id = path_product_id or body.product_id
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_product_role(cur, product_id, user.id, "editor")
            try:
                cur.execute(
                    """
                    INSERT INTO swimlane_component (
                        product_id, code, name, category, owner_role, description,
                        status, current_version_no, created_by, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, 'DRAFT', 0, %s, NOW())
                    RETURNING id
                    """,
                    (
                        product_id,
                        body.code.strip(),
                        body.name.strip(),
                        body.category,
                        body.owner_role,
                        body.description,
                        str(user.id),
                    ),
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="swimlane component code already exists in product",
                ) from exc
            component_id = cur.fetchone()["id"]
            _insert_empty_draft_version(cur, component_id, user.id)
            return _fetch_component(cur, component_id)


@router.get("/swimlane-components/{component_id}", response_model=SwimlaneComponentResponse)
def get_swimlane_component(
    component_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> SwimlaneComponentResponse:
    with get_connection() as conn:
        with conn.cursor() as cur:
            product_id = _component_product_id(cur, component_id)
            ensure_product_role(cur, product_id, user.id, "viewer")
            return _fetch_component(cur, component_id)


@router.patch("/swimlane-components/{component_id}", response_model=SwimlaneComponentResponse)
def update_swimlane_component(
    component_id: UUID,
    body: SwimlaneComponentUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> SwimlaneComponentResponse:
    fields_set = body.model_fields_set
    updates: dict[str, str | None] = {}
    if "code" in fields_set and body.code is not None:
        updates["code"] = body.code.strip()
    if "name" in fields_set and body.name is not None:
        updates["name"] = body.name.strip()
    if "category" in fields_set:
        updates["category"] = (body.category or "").strip() or None
    if "owner_role" in fields_set:
        updates["owner_role"] = (body.owner_role or "").strip() or None
    if "description" in fields_set:
        updates["description"] = (body.description or "").strip() or None
    if "status" in fields_set and body.status is not None:
        if body.status not in {"DRAFT", "PUBLISHED", "ARCHIVED"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid swimlane component status",
            )
        updates["status"] = body.status

    with db_transaction() as conn:
        with conn.cursor() as cur:
            product_id = _component_product_id(cur, component_id)
            ensure_product_role(cur, product_id, user.id, "editor")
            if updates:
                assignments = [f"{field} = %s" for field in updates]
                values = [*updates.values(), component_id]
                try:
                    cur.execute(
                        f"""
                        UPDATE swimlane_component
                        SET {", ".join(assignments)}, updated_at = NOW()
                        WHERE id = %s AND deleted_at IS NULL
                        """,
                        values,
                    )
                except Exception as exc:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="swimlane component code already exists in product",
                    ) from exc
            return _fetch_component(cur, component_id)


@router.put("/swimlane-components/{component_id}/draft-version", response_model=SwimlaneComponentResponse)
@router.put("/swimlane-components/{component_id}/version", response_model=SwimlaneComponentResponse)
def save_swimlane_component_draft_version(
    component_id: UUID,
    body: SwimlaneComponentVersionSaveRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> SwimlaneComponentResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            product_id = _component_product_id(cur, component_id)
            ensure_product_role(cur, product_id, user.id, "editor")
            cur.execute(
                """
                SELECT current_version_no
                FROM swimlane_component
                WHERE id = %s
                FOR UPDATE
                """,
                (component_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"swimlane component not found: {component_id}",
                )
            version_no = int(row["current_version_no"]) + 1
            metadata_updates = _metadata_updates_from_version_body(body)
            assignments = [f"{field} = %s" for field in metadata_updates]
            assignments.extend(["status = CASE WHEN current_version_no > 0 THEN status ELSE 'DRAFT' END", "updated_at = NOW()"])
            if assignments:
                cur.execute(
                    f"""
                    UPDATE swimlane_component
                    SET {", ".join(assignments)}
                    WHERE id = %s
                    """,
                    [*metadata_updates.values(), component_id],
                )
            cur.execute(
                """
                DELETE FROM swimlane_component_version
                WHERE component_id = %s AND status = 'DRAFT'
                """,
                (component_id,),
            )
            _insert_version_payload(cur, component_id, version_no, "DRAFT", body, user.id, False)
            return _fetch_component(cur, component_id)


@router.post("/swimlane-components/{component_id}/versions/publish", response_model=SwimlaneComponentResponse)
def publish_swimlane_component_version(
    component_id: UUID,
    body: SwimlaneComponentVersionSaveRequest | None = None,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> SwimlaneComponentResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            product_id = _component_product_id(cur, component_id)
            ensure_product_role(cur, product_id, user.id, "editor")
            cur.execute(
                """
                SELECT current_version_no
                FROM swimlane_component
                WHERE id = %s
                FOR UPDATE
                """,
                (component_id,),
            )
            component = cur.fetchone()
            if not component:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"swimlane component not found: {component_id}",
                )
            draft_body = body
            if draft_body is None:
                cur.execute(
                    """
                    SELECT id, version_no, version_name, canvas_json, semantic_json, thumbnail_url
                    FROM swimlane_component_version
                    WHERE component_id = %s AND status = 'DRAFT'
                    ORDER BY version_no DESC
                    LIMIT 1
                    """,
                    (component_id,),
                )
                draft = cur.fetchone()
                if not draft:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="no draft version to publish",
                    )
                cur.execute(
                    """
                    SELECT id, node_key, node_type, title, description, actor, business_rule,
                           input_summary, output_summary, position_x, position_y, width, height,
                           bpmn_element_type, bpmn_event_kind, bpmn_event_definition,
                           bpmn_task_type, bpmn_gateway_type, bpmn_subprocess_kind,
                           bpmn_call_activity_ref, bpmn_boundary_attached_to_node_key,
                           mes_semantics_json,
                           style_json, properties_json
                    FROM swimlane_component_node
                    WHERE component_version_id = %s
                    ORDER BY created_at ASC, node_key ASC
                    """,
                    (draft["id"],),
                )
                node_rows = cur.fetchall()
                refs_by_node_id = _component_node_er_refs_by_node_id(
                    cur,
                    [row["id"] for row in node_rows],
                )
                nodes = []
                for row in node_rows:
                    nodes.append(
                        {
                            **row,
                            "position_x": float(row["position_x"]),
                            "position_y": float(row["position_y"]),
                            "width": float(row["width"]),
                            "height": float(row["height"]),
                            "er_refs": refs_by_node_id.get(row["id"], []),
                            "mes_semantics_json": row.get("mes_semantics_json") or {},
                            "style_json": row.get("style_json") or {},
                            "properties_json": row.get("properties_json") or {},
                        }
                    )
                cur.execute(
                    """
                    SELECT edge_key, source_node_key, target_node_key, source_port, target_port,
                           edge_type, label, condition_text, bpmn_flow_type,
                           bpmn_sequence_flow_kind, bpmn_message_name,
                           bpmn_condition_expression, data_contract_json,
                           mes_semantics_json, style_json, properties_json
                    FROM swimlane_component_edge
                    WHERE component_version_id = %s
                    ORDER BY created_at ASC, edge_key ASC
                    """,
                    (draft["id"],),
                )
                edges = [
                    {
                        **row,
                        "data_contract_json": row.get("data_contract_json") or {},
                        "mes_semantics_json": row.get("mes_semantics_json") or {},
                        "style_json": row.get("style_json") or {},
                        "properties_json": row.get("properties_json") or {},
                    }
                    for row in cur.fetchall()
                ]
                draft_body = SwimlaneComponentVersionSaveRequest(
                    canvas_json=draft.get("canvas_json") or {},
                    semantic_json=draft.get("semantic_json") or {},
                    thumbnail_url=draft.get("thumbnail_url"),
                    nodes=nodes,
                    edges=edges,
                )
            version_no = int(component["current_version_no"]) + 1
            metadata_updates = _metadata_updates_from_version_body(draft_body)
            if metadata_updates:
                assignments = [f"{field} = %s" for field in metadata_updates]
                cur.execute(
                    f"""
                    UPDATE swimlane_component
                    SET {", ".join(assignments)}, updated_at = NOW()
                    WHERE id = %s
                    """,
                    [*metadata_updates.values(), component_id],
                )
            cur.execute(
                """
                DELETE FROM swimlane_component_version
                WHERE component_id = %s AND status = 'DRAFT'
                """,
                (component_id,),
            )
            _insert_version_payload(cur, component_id, version_no, "PUBLISHED", draft_body, user.id, True)
            cur.execute(
                """
                UPDATE swimlane_component
                SET current_version_no = %s, status = 'PUBLISHED', updated_at = NOW()
                WHERE id = %s
                """,
                (version_no, component_id),
            )
            return _fetch_component(cur, component_id)


@router.delete("/swimlane-components/{component_id}", response_model=SwimlaneComponentResponse)
def archive_swimlane_component(
    component_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> SwimlaneComponentResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            product_id = _component_product_id(cur, component_id)
            ensure_product_role(cur, product_id, user.id, "owner")
            component = _fetch_component(cur, component_id)
            cur.execute(
                """
                UPDATE swimlane_component
                SET status = 'ARCHIVED', deleted_at = NOW(), updated_at = NOW()
                WHERE id = %s AND deleted_at IS NULL
                """,
                (component_id,),
            )
            return component
