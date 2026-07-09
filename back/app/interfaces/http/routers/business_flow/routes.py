"""Routes for the new Business Flow Context."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from psycopg.types.json import Jsonb

from app.config import get_settings
from app.database import db_transaction, get_connection
from app.domain.business_flow.bpmn import (
    edge_profile_error,
    node_profile_error,
    strip_mes_json,
)
from app.domain.business_flow.bpmn_semantic import (
    bpmn_semantic_payload,
    bpmn_semantic_quality_issues,
    edge_semantic_type,
    is_data_element,
    node_semantic_type,
    semantic_display_name,
)
from app.domain.business_flow.semantic_profile import (
    business_flow_quality_issues,
    semantic_payload,
    semantic_payload_error,
    semantic_profile_key,
    semantic_profile_version,
)
from app.domain.business_flow.task_ui import (
    container_structure_error,
    process_container_payload,
    task_ui_payload,
)
from app.interfaces.http.schemas.business_flow import (
    ApplyBusinessFlowChangesRequest,
    ApplyBusinessFlowChangesResponse,
    BusinessFlowChangeOpPayload,
    BusinessFlowCreateRequest,
    BusinessFlowEditorStateResponse,
    BusinessFlowHistoryItemDTO,
    BusinessFlowMemberResponse,
    BusinessFlowMemberUpsertRequest,
    BusinessFlowMetaResponse,
    BusinessFlowRole,
    BusinessFlowUpdateRequest,
    PlaceSwimlaneComponentPayload,
    PlaceSwimlaneComponentResponse,
    RestoreBusinessFlowRequest,
    RestoreBusinessFlowResponse,
)
from app.services.auth import (
    AuthenticatedUser,
    ensure_business_flow_role,
    ensure_internal_token,
    ensure_product_role,
    get_current_user_from_header,
)

router = APIRouter(prefix="/business-flows", tags=["business-flow"])


def _default_product_id() -> UUID:
    return UUID(get_settings().default_product_id)


LANE_PADDING_LEFT = 24.0
LANE_PADDING_RIGHT = 32.0
LANE_HEADER_HEIGHT = 46.0
LANE_PADDING_BOTTOM = 32.0
LANE_MIN_WIDTH = 360.0
LANE_MIN_HEIGHT = 360.0


BUSINESS_FLOW_META_SELECT = """
WITH lane_counts AS (
    SELECT business_flow_id, COUNT(*) AS lane_instance_count
    FROM business_flow_lane_instance
    WHERE status = 'ACTIVE'
    GROUP BY business_flow_id
),
node_counts AS (
    SELECT business_flow_id, COUNT(*) AS node_count
    FROM business_flow_node
    GROUP BY business_flow_id
),
edge_counts AS (
    SELECT business_flow_id, COUNT(*) AS edge_count
    FROM business_flow_edge
    GROUP BY business_flow_id
)
SELECT bf.id, bf.product_id, p.code AS product_code, p.name AS product_name,
       bf.code, bf.name, bf.description,
       bf.status, bf.current_version, bf.updated_at,
       CASE GREATEST(
            COALESCE(CASE bfm.role
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
       COALESCE(lc.lane_instance_count, 0) AS lane_instance_count,
       COALESCE(nc.node_count, 0) AS node_count,
       COALESCE(ec.edge_count, 0) AS edge_count
FROM business_flow bf
LEFT JOIN product p ON p.id = bf.product_id
LEFT JOIN business_flow_member bfm
  ON bfm.business_flow_id = bf.id AND bfm.user_id = %s
LEFT JOIN product_member pm
  ON pm.product_id = bf.product_id AND pm.user_id = %s
LEFT JOIN lane_counts lc ON lc.business_flow_id = bf.id
LEFT JOIN node_counts nc ON nc.business_flow_id = bf.id
LEFT JOIN edge_counts ec ON ec.business_flow_id = bf.id
WHERE bf.id = %s
  AND (bfm.user_id IS NOT NULL OR pm.user_id IS NOT NULL)
"""


def _business_flow_meta_response(row: dict) -> BusinessFlowMetaResponse:
    return BusinessFlowMetaResponse(
        id=row["id"],
        product_id=row["product_id"],
        product_code=row.get("product_code"),
        product_name=row.get("product_name"),
        code=row["code"],
        name=row["name"],
        description=row["description"],
        status=row["status"],
        current_version=row["current_version"],
        updated_at=row["updated_at"],
        lane_instance_count=row.get("lane_instance_count") or 0,
        node_count=row.get("node_count") or 0,
        edge_count=row.get("edge_count") or 0,
        current_user_role=row.get("current_user_role"),
    )


def _fetch_business_flow_meta(
    cur,
    business_flow_id: UUID,
    user_id: UUID,
) -> BusinessFlowMetaResponse:
    cur.execute(BUSINESS_FLOW_META_SELECT, (user_id, user_id, business_flow_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"business flow not found: {business_flow_id}",
        )
    return _business_flow_meta_response(row)


@router.get("", response_model=list[BusinessFlowMetaResponse])
def list_business_flows(
    product_id: UUID | None = None,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[BusinessFlowMetaResponse]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH lane_counts AS (
                    SELECT business_flow_id, COUNT(*) AS lane_instance_count
                    FROM business_flow_lane_instance
                    WHERE status = 'ACTIVE'
                    GROUP BY business_flow_id
                ),
                node_counts AS (
                    SELECT business_flow_id, COUNT(*) AS node_count
                    FROM business_flow_node
                    GROUP BY business_flow_id
                ),
                edge_counts AS (
                    SELECT business_flow_id, COUNT(*) AS edge_count
                    FROM business_flow_edge
                    GROUP BY business_flow_id
                )
                SELECT bf.id, bf.product_id, p.code AS product_code, p.name AS product_name,
                       bf.code, bf.name, bf.description,
                       bf.status, bf.current_version, bf.updated_at,
                       CASE GREATEST(
                            COALESCE(CASE bfm.role
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
                       COALESCE(lc.lane_instance_count, 0) AS lane_instance_count,
                       COALESCE(nc.node_count, 0) AS node_count,
                       COALESCE(ec.edge_count, 0) AS edge_count
                FROM business_flow bf
                LEFT JOIN product p ON p.id = bf.product_id
                LEFT JOIN business_flow_member bfm
                  ON bfm.business_flow_id = bf.id AND bfm.user_id = %s
                LEFT JOIN product_member pm
                  ON pm.product_id = bf.product_id AND pm.user_id = %s
                LEFT JOIN lane_counts lc ON lc.business_flow_id = bf.id
                LEFT JOIN node_counts nc ON nc.business_flow_id = bf.id
                LEFT JOIN edge_counts ec ON ec.business_flow_id = bf.id
                WHERE (bfm.user_id IS NOT NULL OR pm.user_id IS NOT NULL)
                  AND (%s::uuid IS NULL OR bf.product_id = %s)
                  AND bf.status <> 'ARCHIVED'
                ORDER BY bf.updated_at DESC, lower(bf.name)
                """,
                (user.id, user.id, product_id, product_id),
            )
            return [_business_flow_meta_response(row) for row in cur.fetchall()]


@router.post("", response_model=BusinessFlowMetaResponse)
def create_business_flow(
    body: BusinessFlowCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMetaResponse:
    product_id = body.product_id or _default_product_id()
    code = body.code.strip()
    name = body.name.strip()
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="business flow code is required")
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="business flow name is required")
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_product_role(cur, product_id, user.id, "editor")
            try:
                cur.execute(
                    """
                    INSERT INTO business_flow (
                        product_id, code, name, description, created_by, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    RETURNING id
                    """,
                    (product_id, code, name, body.description, str(user.id)),
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="business flow code already exists in product",
                ) from exc
            business_flow_id = cur.fetchone()["id"]
            cur.execute(
                """
                INSERT INTO business_flow_member (business_flow_id, user_id, role)
                VALUES (%s, %s, 'owner')
                ON CONFLICT (business_flow_id, user_id)
                DO UPDATE SET role = 'owner', updated_at = NOW()
                """,
                (business_flow_id, user.id),
            )
            return _fetch_business_flow_meta(cur, business_flow_id, user.id)


@router.get("/{business_flow_id}", response_model=BusinessFlowMetaResponse)
def get_business_flow_meta(
    business_flow_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMetaResponse:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "viewer")
            return _fetch_business_flow_meta(cur, business_flow_id, user.id)


@router.patch("/{business_flow_id}", response_model=BusinessFlowMetaResponse)
def update_business_flow(
    business_flow_id: UUID,
    body: BusinessFlowUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMetaResponse:
    fields_set = body.model_fields_set
    updates: dict[str, str | None] = {}
    if "name" in fields_set:
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="business flow name cannot be empty")
        updates["name"] = name
    if "description" in fields_set:
        updates["description"] = (body.description or "").strip() or None
    if "status" in fields_set and body.status is not None:
        if body.status not in {"DRAFT", "PUBLISHED", "ARCHIVED"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid business flow status")
        updates["status"] = body.status

    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "editor")
            _ensure_active_business_flow(cur, business_flow_id)
            if updates:
                assignments = [f"{field} = %s" for field in updates]
                values = [*updates.values(), business_flow_id]
                cur.execute(
                    f"""
                    UPDATE business_flow
                    SET {", ".join(assignments)}, updated_at = NOW()
                    WHERE id = %s AND status <> 'ARCHIVED'
                    """,
                    values,
                )
                if cur.rowcount == 0:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"business flow not found: {business_flow_id}",
                    )
            return _fetch_business_flow_meta(cur, business_flow_id, user.id)


@router.delete("/{business_flow_id}", response_model=BusinessFlowMetaResponse)
def archive_business_flow(
    business_flow_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMetaResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "owner")
            meta = _fetch_business_flow_meta(cur, business_flow_id, user.id)
            cur.execute(
                """
                UPDATE business_flow
                SET status = 'ARCHIVED', updated_at = NOW()
                WHERE id = %s AND status <> 'ARCHIVED'
                """,
                (business_flow_id,),
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"business flow not found: {business_flow_id}",
                )
            return meta


def _json_value(row: dict, key: str) -> dict:
    return row.get(key) or {}


def _lane_response(row: dict) -> dict:
    return {
        **row,
        "position_x": float(row["position_x"]),
        "position_y": float(row["position_y"]),
        "width": float(row["width"]),
        "height": float(row["height"]),
        "is_overridden": bool((row.get("override_json") or {})),
        "layout_json": _json_value(row, "layout_json"),
        "override_json": _json_value(row, "override_json"),
    }


def _node_response(row: dict, refs_by_node_id: dict[UUID, list[dict]] | None = None) -> dict:
    semantic_type = node_semantic_type(row)
    bpmn_semantic = bpmn_semantic_payload(
        row.get("bpmn_semantic_json"),
        semantic_type,
        row.get("title"),
    )
    title = semantic_display_name(bpmn_semantic, row.get("title"))
    er_refs = (refs_by_node_id or {}).get(row["id"], []) if is_data_element(row) else []
    return {
        **row,
        "title": title,
        "position_x": float(row["position_x"]),
        "position_y": float(row["position_y"]),
        "width": float(row["width"]),
        "height": float(row["height"]),
        "style_json": _json_value(row, "style_json"),
        "semantic_payload_json": _json_value(row, "semantic_payload_json"),
        "bpmn_semantic_json": bpmn_semantic,
        "task_ui_json": _json_value(row, "task_ui_json"),
        "process_container_json": _json_value(row, "process_container_json"),
        "properties_json": strip_mes_json(_json_value(row, "properties_json")),
        "er_refs": er_refs,
    }


def _edge_response(row: dict) -> dict:
    bpmn_semantic = bpmn_semantic_payload(
        row.get("bpmn_semantic_json"),
        edge_semantic_type(row),
        row.get("label"),
    )
    return {
        **row,
        "label": semantic_display_name(bpmn_semantic, row.get("label")) or None,
        "data_contract_json": _json_value(row, "data_contract_json"),
        "semantic_payload_json": _json_value(row, "semantic_payload_json"),
        "bpmn_semantic_json": bpmn_semantic,
        "style_json": _json_value(row, "style_json"),
        "properties_json": strip_mes_json(_json_value(row, "properties_json")),
    }


def _semantic_fields_from_patch(patch: dict[str, Any]) -> dict[str, Any]:
    values: dict[str, Any] = {}
    if "semanticProfileKey" in patch:
        values["semantic_profile_key"] = semantic_profile_key(patch.get("semanticProfileKey"))
    if "semanticProfileVersion" in patch:
        values["semantic_profile_version"] = semantic_profile_version(
            patch.get("semanticProfileVersion")
        )
    if "semanticPayloadJson" in patch:
        values["semantic_payload_json"] = Jsonb(
            semantic_payload(patch.get("semanticPayloadJson"))
        )
    return values


def _bpmn_semantic_field_from_patch(
    patch: dict[str, Any],
    semantic_type: str | None,
    fallback_name: str | None = None,
) -> dict[str, Any]:
    if "bpmnSemanticJson" not in patch:
        return {}
    payload = bpmn_semantic_payload(
        patch.get("bpmnSemanticJson"),
        semantic_type,
        fallback_name,
    )
    return {"bpmn_semantic_json": Jsonb(payload)}


def _semantic_patch_fields(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "semanticProfileKey": row.get("semantic_profile_key"),
        "semanticProfileVersion": row.get("semantic_profile_version"),
        "semanticPayloadJson": semantic_payload(row.get("semantic_payload_json")),
    }


def _node_context_fields_from_patch(patch: dict[str, Any]) -> dict[str, Any]:
    values: dict[str, Any] = {}
    if "taskUiJson" in patch:
        values["task_ui_json"] = Jsonb(task_ui_payload(patch.get("taskUiJson")))
    if "processContainerJson" in patch:
        values["process_container_json"] = Jsonb(
            process_container_payload(patch.get("processContainerJson"))
        )
    if "containerNodeKey" in patch:
        value = patch.get("containerNodeKey")
        values["container_node_key"] = str(value).strip() if value else None
    return values


def _node_context_patch_fields(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "taskUiJson": task_ui_payload(row.get("task_ui_json")),
        "processContainerJson": process_container_payload(row.get("process_container_json")),
        "containerNodeKey": row.get("container_node_key"),
    }


def _ensure_valid_semantic_payload(
    profile_key: str | None,
    payload: dict[str, Any] | None,
    target_scope: str,
    target_key: str,
) -> None:
    error = semantic_payload_error(profile_key, payload, target_scope)  # type: ignore[arg-type]
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid semantic profile {target_key}: {error}",
        )


def _fetch_business_flow_editor_state(
    cur,
    business_flow_id: UUID,
) -> BusinessFlowEditorStateResponse:
    cur.execute(
        """
        SELECT current_version, collab_revision
        FROM business_flow
        WHERE id = %s AND status <> 'ARCHIVED'
        """,
        (business_flow_id,),
    )
    flow = cur.fetchone()
    if not flow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"business flow not found: {business_flow_id}",
        )
    cur.execute(
        """
        SELECT li.id, li.instance_key, li.component_id, li.component_version_id,
               sc.name AS component_name, scv.version_no AS component_version_no,
               li.display_name, li.owner_role, li.position_x, li.position_y,
               li.width, li.height, li.z_index, li.layout_json, li.override_json
        FROM business_flow_lane_instance li
        JOIN swimlane_component sc ON sc.id = li.component_id
        JOIN swimlane_component_version scv ON scv.id = li.component_version_id
        WHERE li.business_flow_id = %s AND li.status = 'ACTIVE'
        ORDER BY li.z_index ASC, li.created_at ASC
        """,
        (business_flow_id,),
    )
    lanes = [_lane_response(row) for row in cur.fetchall()]

    cur.execute(
        """
        SELECT id, business_flow_id, business_flow_node_id, er_diagram_id,
               er_table_key, er_column_key, ref_type, description
        FROM business_flow_node_er_ref
        WHERE business_flow_id = %s
        ORDER BY created_at ASC
        """,
        (business_flow_id,),
    )
    refs_by_node_id: dict[UUID, list[dict]] = {}
    for ref in cur.fetchall():
        refs_by_node_id.setdefault(ref["business_flow_node_id"], []).append(
            {
                "id": ref["id"],
                "er_diagram_id": ref["er_diagram_id"],
                "er_table_key": ref["er_table_key"],
                "er_column_key": ref["er_column_key"],
                "ref_type": ref["ref_type"],
                "description": ref["description"],
            }
        )

    cur.execute(
        """
        SELECT id, lane_instance_id, node_key, origin_component_node_key, node_type,
               bpmn_element_type, bpmn_event_kind, bpmn_event_definition,
               bpmn_task_type, bpmn_gateway_type, bpmn_subprocess_kind,
               bpmn_call_activity_ref,
               title, description, actor, business_rule, input_summary, output_summary,
               position_x, position_y, width, height, is_overridden, style_json,
               semantic_profile_key, semantic_profile_version, semantic_payload_json,
               bpmn_semantic_json,
               task_ui_json, process_container_json, container_node_key,
               properties_json
        FROM business_flow_node
        WHERE business_flow_id = %s
        ORDER BY created_at ASC, node_key ASC
        """,
        (business_flow_id,),
    )
    nodes = [_node_response(row, refs_by_node_id) for row in cur.fetchall()]

    cur.execute(
        """
        SELECT e.id, e.lane_instance_id, e.edge_key, e.source_type,
               e.source_node_id, sn.node_key AS source_node_key,
               e.source_lane_instance_id, sli.instance_key AS source_lane_instance_key,
               e.source_port, e.target_type,
               e.target_node_id, tn.node_key AS target_node_key,
               e.target_lane_instance_id, tli.instance_key AS target_lane_instance_key,
               e.target_port, e.edge_type, e.label, e.condition_text,
               e.bpmn_flow_type, e.bpmn_sequence_flow_kind, e.bpmn_message_name,
               e.bpmn_condition_expression, e.data_contract_json,
               e.semantic_profile_key, e.semantic_profile_version,
               e.semantic_payload_json,
               e.bpmn_semantic_json,
               e.origin_component_edge_key, e.is_overridden,
               e.style_json, e.properties_json
        FROM business_flow_edge e
        LEFT JOIN business_flow_node sn ON sn.id = e.source_node_id
        LEFT JOIN business_flow_node tn ON tn.id = e.target_node_id
        LEFT JOIN business_flow_lane_instance sli ON sli.id = e.source_lane_instance_id
        LEFT JOIN business_flow_lane_instance tli ON tli.id = e.target_lane_instance_id
        WHERE e.business_flow_id = %s
        ORDER BY e.created_at ASC, e.edge_key ASC
        """,
        (business_flow_id,),
    )
    edges = [_edge_response(row) for row in cur.fetchall()]
    refs_by_node_key = {
        node["node_key"]: node.get("er_refs") or []
        for node in nodes
        if node.get("node_key")
    }
    quality_issues = business_flow_quality_issues(nodes, edges, refs_by_node_key)
    for node in nodes:
        quality_issues.extend(
            bpmn_semantic_quality_issues(
                node,
                node.get("bpmn_semantic_json") or {},
                "NODE",
            )
        )
    for edge in edges:
        quality_issues.extend(
            bpmn_semantic_quality_issues(
                edge,
                edge.get("bpmn_semantic_json") or {},
                "EDGE",
            )
        )

    semantic_json = {
        "businessFlowId": str(business_flow_id),
        "lanes": lanes,
        "nodes": nodes,
        "edges": edges,
        "qualityIssues": quality_issues,
    }
    return BusinessFlowEditorStateResponse(
        business_flow_id=business_flow_id,
        current_version=int(flow["current_version"]),
        collab_revision=int(flow.get("collab_revision") or 1),
        canvas_json={"semantic": semantic_json},
        semantic_json=semantic_json,
        lane_instances=lanes,
        nodes=nodes,
        edges=edges,
        quality_issues=quality_issues,
    )


def _write_business_flow_snapshot(
    cur,
    business_flow_id: UUID,
    version: int,
    user_id: UUID | str,
) -> None:
    state = _fetch_business_flow_editor_state(cur, business_flow_id)
    snapshot = state.model_dump(mode="json")
    cur.execute(
        """
        INSERT INTO business_flow_snapshot (
            business_flow_id, version, canvas_json, semantic_json, created_by
        )
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (business_flow_id, version)
        DO UPDATE SET canvas_json = EXCLUDED.canvas_json,
                      semantic_json = EXCLUDED.semantic_json,
                      created_by = EXCLUDED.created_by,
                      created_at = NOW()
        """,
        (
            business_flow_id,
            version,
            Jsonb(snapshot["canvas_json"]),
            Jsonb(snapshot["semantic_json"]),
            str(user_id),
        ),
    )


def _append_change_batch(
    cur,
    business_flow_id: UUID,
    base_version: int,
    new_version: int,
    source: str,
    summary: str,
    ops: list[dict],
    user_id: UUID | str,
) -> None:
    cur.execute(
        """
        INSERT INTO business_flow_change_batch (
            business_flow_id, base_version, new_version, source, summary, created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (business_flow_id, base_version, new_version, source, summary, str(user_id)),
    )
    batch_id = cur.fetchone()["id"]
    for index, op in enumerate(ops, start=1):
        clean_patch = strip_mes_json(op.get("patch") or {})
        clean_inverse_patch = strip_mes_json(op.get("inverse_patch") or {})
        cur.execute(
            """
            INSERT INTO business_flow_change_op (
                batch_id, op_seq, op_type, target_type, target_key,
                patch_json, inverse_patch_json, summary
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                batch_id,
                index,
                op["op_type"],
                op["target_type"],
                op["target_key"],
                Jsonb(clean_patch),
                Jsonb(clean_inverse_patch),
                op.get("summary"),
            ),
        )


def _resolve_node_id(cur, business_flow_id: UUID, node_key: str) -> UUID:
    cur.execute(
        """
        SELECT id
        FROM business_flow_node
        WHERE business_flow_id = %s AND node_key = %s
        """,
        (business_flow_id, node_key),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"node not found: {node_key}")
    return row["id"]


def _node_profile_by_key(cur, business_flow_id: UUID, node_key: str) -> dict[str, Any]:
    cur.execute(
        """
        SELECT id, node_key, node_type, title, bpmn_element_type, bpmn_event_kind,
               bpmn_event_definition, bpmn_task_type, bpmn_gateway_type,
               bpmn_subprocess_kind, bpmn_call_activity_ref,
               semantic_profile_key, semantic_profile_version, semantic_payload_json,
               bpmn_semantic_json,
               task_ui_json, process_container_json, container_node_key
        FROM business_flow_node
        WHERE business_flow_id = %s AND node_key = %s
        """,
        (business_flow_id, node_key),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"node not found: {node_key}",
        )
    return dict(row)


def _ensure_valid_node(node: dict[str, Any], node_key: str) -> None:
    error = node_profile_error(node)
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid BPMN node {node_key}: {error}",
        )


def _ensure_container_parent(cur, business_flow_id: UUID, node_key: str, container_key: str | None) -> None:
    if not container_key:
        return
    if container_key == node_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"node cannot contain itself: {node_key}",
        )
    container = _node_profile_by_key(cur, business_flow_id, container_key)
    structure_error = container_structure_error(
        [
            {**container, "node_key": container_key},
            {"node_key": node_key, "container_node_key": container_key},
        ]
    )
    if structure_error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid process container structure: {structure_error}",
        )


def _ensure_node_edge_compatibility(
    cur,
    business_flow_id: UUID,
    node_key: str,
    node: dict[str, Any],
) -> None:
    if node.get("bpmn_element_type") not in {
        "DATA_OBJECT",
        "DATA_INPUT",
        "DATA_OUTPUT",
        "DATA_STORE",
    }:
        return
    cur.execute(
        """
        SELECT e.edge_key, e.edge_type, e.bpmn_flow_type
        FROM business_flow_edge e
        LEFT JOIN business_flow_node source ON source.id = e.source_node_id
        LEFT JOIN business_flow_node target ON target.id = e.target_node_id
        WHERE e.business_flow_id = %s
          AND (source.node_key = %s OR target.node_key = %s)
          AND (e.edge_type <> 'ASSOCIATION' OR e.bpmn_flow_type <> 'ASSOCIATION')
        LIMIT 1
        """,
        (business_flow_id, node_key, node_key),
    )
    invalid_edge = cur.fetchone()
    if invalid_edge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"node {node_key} cannot become a data node while edge "
                f"{invalid_edge['edge_key']} is not an association"
            ),
        )


def _ensure_valid_edge(
    edge: dict[str, Any],
    edge_key: str,
    source_node: dict[str, Any],
    target_node: dict[str, Any],
) -> None:
    error = edge_profile_error(edge, source_node, target_node)
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid BPMN edge {edge_key}: {error}",
        )


def _resolve_lane_id(cur, business_flow_id: UUID, instance_key: str) -> UUID:
    cur.execute(
        """
        SELECT id
        FROM business_flow_lane_instance
        WHERE business_flow_id = %s AND instance_key = %s AND status = 'ACTIVE'
        """,
        (business_flow_id, instance_key),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"lane instance not found: {instance_key}",
        )
    return row["id"]


def _node_lane_id(cur, business_flow_id: UUID, node_key: str) -> UUID | None:
    cur.execute(
        """
        SELECT lane_instance_id
        FROM business_flow_node
        WHERE business_flow_id = %s AND node_key = %s
        """,
        (business_flow_id, node_key),
    )
    row = cur.fetchone()
    return row["lane_instance_id"] if row else None


def _size_policy(layout_json: dict | None) -> dict:
    size_policy = (layout_json or {}).get("sizePolicy")
    return size_policy if isinstance(size_policy, dict) else {}


def _manual_dimension(size_policy: dict, key: str) -> float | None:
    value = size_policy.get(key)
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _normalize_business_flow_lane_bounds(cur, business_flow_id: UUID) -> None:
    cur.execute(
        """
        SELECT id, width, height, layout_json
        FROM business_flow_lane_instance
        WHERE business_flow_id = %s AND status = 'ACTIVE'
        FOR UPDATE
        """,
        (business_flow_id,),
    )
    lanes = cur.fetchall()
    for lane in lanes:
        cur.execute(
            """
            SELECT id, position_x, position_y, width, height
            FROM business_flow_node
            WHERE business_flow_id = %s AND lane_instance_id = %s
            FOR UPDATE
            """,
            (business_flow_id, lane["id"]),
        )
        nodes = cur.fetchall()
        max_right = LANE_PADDING_LEFT
        max_bottom = LANE_HEADER_HEIGHT
        for node in nodes:
            next_x = max(LANE_PADDING_LEFT, float(node["position_x"]))
            next_y = max(LANE_HEADER_HEIGHT, float(node["position_y"]))
            if next_x != float(node["position_x"]) or next_y != float(node["position_y"]):
                cur.execute(
                    """
                    UPDATE business_flow_node
                    SET position_x = %s, position_y = %s, is_overridden = TRUE,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (next_x, next_y, node["id"]),
                )
            max_right = max(max_right, next_x + float(node["width"]))
            max_bottom = max(max_bottom, next_y + float(node["height"]))

        size_policy = _size_policy(lane.get("layout_json") or {})
        manual_width = _manual_dimension(size_policy, "manualWidth")
        manual_height = _manual_dimension(size_policy, "manualHeight")
        required_width = max(
            LANE_MIN_WIDTH,
            max_right + LANE_PADDING_RIGHT,
            manual_width or 0,
        )
        required_height = max(
            LANE_MIN_HEIGHT,
            max_bottom + LANE_PADDING_BOTTOM,
            manual_height or 0,
        )
        if required_width != float(lane["width"]) or required_height != float(lane["height"]):
            cur.execute(
                """
                UPDATE business_flow_lane_instance
                SET width = %s, height = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (required_width, required_height, lane["id"]),
            )


def _apply_business_flow_op(cur, business_flow_id: UUID, op) -> None:
    patch = op.patch or {}
    target_key = op.target_key
    if op.op_type in {"MOVE_LANE_INSTANCE", "RESIZE_LANE_INSTANCE", "RENAME_LANE_INSTANCE"}:
        values: dict[str, object] = {}
        to = patch.get("to") if isinstance(patch.get("to"), dict) else patch
        if "x" in to:
            values["position_x"] = to["x"]
        if "y" in to:
            values["position_y"] = to["y"]
        if "width" in to:
            values["width"] = to["width"]
        if "height" in to:
            values["height"] = to["height"]
        if "displayName" in patch:
            values["display_name"] = patch["displayName"]
        if "ownerRole" in patch:
            values["owner_role"] = patch["ownerRole"] or None
        layout_json = patch.get("layoutJson") if isinstance(patch.get("layoutJson"), dict) else None
        if values or layout_json is not None:
            assignments = [f"{field} = %s" for field in values]
            if layout_json is not None:
                assignments.append("layout_json = layout_json || %s::jsonb")
            cur.execute(
                f"""
                UPDATE business_flow_lane_instance
                SET {", ".join(assignments)}, override_json = override_json || %s::jsonb,
                    updated_at = NOW()
                WHERE business_flow_id = %s AND instance_key = %s
                """,
                [
                    *values.values(),
                    *([Jsonb(layout_json)] if layout_json is not None else []),
                    Jsonb(patch),
                    business_flow_id,
                    target_key,
                ],
            )
        return

    if op.op_type in {"MOVE_NODE", "UPDATE_NODE"}:
        values = {}
        to = patch.get("to") if isinstance(patch.get("to"), dict) else patch
        if "laneInstanceKey" in patch and patch.get("laneInstanceKey"):
            values["lane_instance_id"] = _resolve_lane_id(cur, business_flow_id, patch["laneInstanceKey"])
        if "x" in to:
            values["position_x"] = to["x"]
        if "y" in to:
            values["position_y"] = to["y"]
        if "width" in to:
            values["width"] = to["width"]
        if "height" in to:
            values["height"] = to["height"]
        mapping = {
            "title": "title",
            "description": "description",
            "actor": "actor",
            "businessRule": "business_rule",
            "inputSummary": "input_summary",
            "outputSummary": "output_summary",
            "nodeType": "node_type",
            "bpmnElementType": "bpmn_element_type",
            "bpmnEventKind": "bpmn_event_kind",
            "bpmnEventDefinition": "bpmn_event_definition",
            "bpmnTaskType": "bpmn_task_type",
            "bpmnGatewayType": "bpmn_gateway_type",
            "bpmnSubProcessKind": "bpmn_subprocess_kind",
            "bpmnCallActivityRef": "bpmn_call_activity_ref",
        }
        for client_key, field in mapping.items():
            if client_key in patch:
                values[field] = patch[client_key] or None
        if "nodeType" in patch and patch.get("nodeType"):
            values["node_type"] = patch["nodeType"]
        if "styleJson" in patch:
            values["style_json"] = Jsonb(patch.get("styleJson") or {})
        if "propertiesJson" in patch:
            values["properties_json"] = Jsonb(
                strip_mes_json(patch.get("propertiesJson") or {})
            )
        values.update(_semantic_fields_from_patch(patch))
        values.update(_node_context_fields_from_patch(patch))
        if "bpmnSemanticJson" in patch:
            values["bpmn_semantic_json"] = Jsonb(patch.get("bpmnSemanticJson") or {})
        if values:
            candidate = _node_profile_by_key(cur, business_flow_id, target_key)
            candidate.update(
                {
                    field: value
                    for field, value in values.items()
                    if field
                    in {
                        "node_type",
                        "bpmn_element_type",
                        "bpmn_event_kind",
                        "bpmn_event_definition",
                        "bpmn_task_type",
                        "bpmn_gateway_type",
                        "bpmn_subprocess_kind",
                        "bpmn_call_activity_ref",
                    }
                }
            )
            _ensure_valid_node(candidate, target_key)
            semantic_type = node_semantic_type(candidate)
            if "bpmnSemanticJson" in patch:
                bpmn_semantic = bpmn_semantic_payload(
                    patch.get("bpmnSemanticJson"),
                    semantic_type,
                    patch.get("title") or candidate.get("title"),
                )
                values["bpmn_semantic_json"] = Jsonb(bpmn_semantic)
                if semantic_type:
                    values["title"] = semantic_display_name(
                        bpmn_semantic,
                        patch.get("title") or candidate.get("title"),
                    )
                    values.update({
                        "description": None,
                        "actor": None,
                        "business_rule": None,
                        "input_summary": None,
                        "output_summary": None,
                    })
            _ensure_node_edge_compatibility(
                cur,
                business_flow_id,
                target_key,
                candidate,
            )
            _ensure_container_parent(
                cur,
                business_flow_id,
                target_key,
                values.get("container_node_key") if "container_node_key" in values else candidate.get("container_node_key"),
            )
            semantic_key_value = (
                values.get("semantic_profile_key")
                if "semantic_profile_key" in values
                else candidate.get("semantic_profile_key")
            )
            semantic_payload_value = (
                semantic_payload(patch.get("semanticPayloadJson"))
                if "semanticPayloadJson" in patch
                else candidate.get("semantic_payload_json")
            )
            _ensure_valid_semantic_payload(
                semantic_key_value,
                semantic_payload(semantic_payload_value),
                "NODE",
                target_key,
            )
            assignments = [f"{field} = %s" for field in values]
            cur.execute(
                f"""
                UPDATE business_flow_node
                SET {", ".join(assignments)}, is_overridden = TRUE, updated_at = NOW()
                WHERE business_flow_id = %s AND node_key = %s
                """,
                [*values.values(), business_flow_id, target_key],
            )
        return

    if op.op_type == "ADD_NODE":
        lane_id = _resolve_lane_id(cur, business_flow_id, patch["laneInstanceKey"])
        _ensure_valid_node(patch, target_key)
        semantic_type = node_semantic_type(patch)
        bpmn_semantic = bpmn_semantic_payload(
            patch.get("bpmnSemanticJson"),
            semantic_type,
            patch.get("title"),
        )
        title = (
            semantic_display_name(bpmn_semantic, patch.get("title"))
            if semantic_type
            else patch.get("title") or "任务"
        )
        _ensure_valid_semantic_payload(
            semantic_profile_key(patch.get("semanticProfileKey")),
            semantic_payload(patch.get("semanticPayloadJson")),
            "NODE",
            target_key,
        )
        _ensure_container_parent(
            cur,
            business_flow_id,
            target_key,
            patch.get("containerNodeKey") or None,
        )
        cur.execute(
            """
            INSERT INTO business_flow_node (
                business_flow_id, lane_instance_id, node_key, node_type, title,
                description, actor, business_rule, input_summary, output_summary,
                bpmn_element_type, bpmn_event_kind, bpmn_event_definition,
                bpmn_task_type, bpmn_gateway_type, bpmn_subprocess_kind,
                bpmn_call_activity_ref,
                position_x, position_y, width, height, is_overridden,
                style_json, properties_json,
                semantic_profile_key, semantic_profile_version, semantic_payload_json,
                bpmn_semantic_json,
                task_ui_json, process_container_json, container_node_key
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (business_flow_id, node_key) DO NOTHING
            """,
            (
                business_flow_id,
                lane_id,
                target_key,
                patch.get("nodeType", "TASK"),
                title,
                None if semantic_type else patch.get("description"),
                None if semantic_type else patch.get("actor"),
                None if semantic_type else patch.get("businessRule"),
                None if semantic_type else patch.get("inputSummary"),
                None if semantic_type else patch.get("outputSummary"),
                patch.get("bpmnElementType"),
                patch.get("bpmnEventKind"),
                patch.get("bpmnEventDefinition"),
                patch.get("bpmnTaskType"),
                patch.get("bpmnGatewayType"),
                patch.get("bpmnSubProcessKind"),
                patch.get("bpmnCallActivityRef"),
                patch.get("x", 0),
                patch.get("y", 0),
                patch.get("width", 120),
                patch.get("height", 60),
                Jsonb(patch.get("styleJson") or {}),
                Jsonb(strip_mes_json(patch.get("propertiesJson") or {})),
                semantic_profile_key(patch.get("semanticProfileKey")),
                semantic_profile_version(patch.get("semanticProfileVersion")),
                Jsonb(semantic_payload(patch.get("semanticPayloadJson"))),
                Jsonb(bpmn_semantic),
                Jsonb(task_ui_payload(patch.get("taskUiJson"))),
                Jsonb(process_container_payload(patch.get("processContainerJson"))),
                patch.get("containerNodeKey") or None,
            ),
        )
        return

    if op.op_type == "REMOVE_NODE":
        cur.execute(
            """
            DELETE FROM business_flow_node
            WHERE business_flow_id = %s AND node_key = %s
            """,
            (business_flow_id, target_key),
        )
        return

    if op.op_type == "ADD_EDGE":
        source_node_key = patch.get("sourceNodeKey") or patch.get("source_node_key")
        target_node_key = patch.get("targetNodeKey") or patch.get("target_node_key")
        if not source_node_key or not target_node_key:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ADD_EDGE requires node endpoints")
        source_node_id = _resolve_node_id(cur, business_flow_id, source_node_key)
        target_node_id = _resolve_node_id(cur, business_flow_id, target_node_key)
        source_node = _node_profile_by_key(cur, business_flow_id, source_node_key)
        target_node = _node_profile_by_key(cur, business_flow_id, target_node_key)
        _ensure_valid_edge(patch, target_key, source_node, target_node)
        semantic_type = edge_semantic_type(patch)
        bpmn_semantic = bpmn_semantic_payload(
            patch.get("bpmnSemanticJson"),
            semantic_type,
            patch.get("label"),
        )
        label = semantic_display_name(bpmn_semantic, patch.get("label")) or None
        _ensure_valid_semantic_payload(
            semantic_profile_key(patch.get("semanticProfileKey")),
            semantic_payload(patch.get("semanticPayloadJson")),
            "EDGE",
            target_key,
        )
        source_lane_id = _node_lane_id(cur, business_flow_id, source_node_key)
        target_lane_id = _node_lane_id(cur, business_flow_id, target_node_key)
        lane_instance_id = source_lane_id if source_lane_id == target_lane_id else None
        cur.execute(
            """
            INSERT INTO business_flow_edge (
                business_flow_id, lane_instance_id, edge_key, source_type,
                source_node_id, source_port, target_type, target_node_id, target_port,
                edge_type, label, condition_text, data_contract_json, is_overridden,
                bpmn_flow_type, bpmn_sequence_flow_kind, bpmn_message_name,
                bpmn_condition_expression,
                style_json, properties_json,
                semantic_profile_key, semantic_profile_version, semantic_payload_json,
                bpmn_semantic_json
            )
            VALUES (%s, %s, %s, 'NODE', %s, %s, 'NODE', %s, %s, %s, %s, %s, %s, TRUE, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (business_flow_id, edge_key) DO UPDATE
            SET lane_instance_id = EXCLUDED.lane_instance_id,
                source_type = EXCLUDED.source_type,
                source_node_id = EXCLUDED.source_node_id,
                source_lane_instance_id = EXCLUDED.source_lane_instance_id,
                source_port = EXCLUDED.source_port,
                target_type = EXCLUDED.target_type,
                target_node_id = EXCLUDED.target_node_id,
                target_lane_instance_id = EXCLUDED.target_lane_instance_id,
                target_port = EXCLUDED.target_port,
                label = EXCLUDED.label,
                edge_type = EXCLUDED.edge_type,
                condition_text = EXCLUDED.condition_text,
                data_contract_json = EXCLUDED.data_contract_json,
                bpmn_flow_type = EXCLUDED.bpmn_flow_type,
                bpmn_sequence_flow_kind = EXCLUDED.bpmn_sequence_flow_kind,
                bpmn_message_name = EXCLUDED.bpmn_message_name,
                bpmn_condition_expression = EXCLUDED.bpmn_condition_expression,
                style_json = EXCLUDED.style_json,
                properties_json = EXCLUDED.properties_json,
                semantic_profile_key = EXCLUDED.semantic_profile_key,
                semantic_profile_version = EXCLUDED.semantic_profile_version,
                semantic_payload_json = EXCLUDED.semantic_payload_json,
                bpmn_semantic_json = EXCLUDED.bpmn_semantic_json,
                is_overridden = TRUE,
                updated_at = NOW()
            """,
            (
                business_flow_id,
                lane_instance_id,
                target_key,
                source_node_id,
                patch.get("sourcePort") or patch.get("source_port"),
                target_node_id,
                patch.get("targetPort") or patch.get("target_port"),
                patch.get("edgeType") or patch.get("edge_type") or ("DEPENDENCY" if lane_instance_id is None else "SEQUENCE"),
                label,
                patch.get("conditionText") or patch.get("condition_text"),
                Jsonb(patch.get("dataContractJson") or patch.get("data_contract_json") or {}),
                patch.get("bpmnFlowType") or patch.get("bpmn_flow_type"),
                patch.get("bpmnSequenceFlowKind") or patch.get("bpmn_sequence_flow_kind"),
                patch.get("bpmnMessageName") or patch.get("bpmn_message_name"),
                patch.get("bpmnConditionExpression") or patch.get("bpmn_condition_expression"),
                Jsonb(patch.get("styleJson") or {}),
                Jsonb(strip_mes_json(patch.get("propertiesJson") or {})),
                semantic_profile_key(patch.get("semanticProfileKey")),
                semantic_profile_version(patch.get("semanticProfileVersion")),
                Jsonb(semantic_payload(patch.get("semanticPayloadJson"))),
                Jsonb(bpmn_semantic),
            ),
        )
        return

    if op.op_type == "UPDATE_EDGE":
        cur.execute(
            """
            SELECT e.source_node_id, e.target_node_id, e.edge_type,
                   e.bpmn_flow_type, e.bpmn_sequence_flow_kind,
                   e.bpmn_message_name, e.bpmn_condition_expression,
                   e.semantic_profile_key, e.semantic_profile_version,
                   e.semantic_payload_json, e.bpmn_semantic_json, e.label,
                   sn.node_key AS source_node_key, tn.node_key AS target_node_key
            FROM business_flow_edge e
            LEFT JOIN business_flow_node sn ON sn.id = e.source_node_id
            LEFT JOIN business_flow_node tn ON tn.id = e.target_node_id
            WHERE e.business_flow_id = %s AND e.edge_key = %s
            """,
            (business_flow_id, target_key),
        )
        current_edge = cur.fetchone()
        if not current_edge:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"edge not found: {target_key}",
            )
        values = {}
        if "sourcePort" in patch:
            values["source_port"] = patch["sourcePort"] or None
        if "targetPort" in patch:
            values["target_port"] = patch["targetPort"] or None
        if "label" in patch:
            values["label"] = patch["label"] or None
        if "edgeType" in patch:
            values["edge_type"] = patch["edgeType"]
        if "conditionText" in patch:
            values["condition_text"] = patch["conditionText"] or None
        if "bpmnFlowType" in patch:
            values["bpmn_flow_type"] = patch["bpmnFlowType"] or None
        if "bpmnSequenceFlowKind" in patch:
            values["bpmn_sequence_flow_kind"] = patch["bpmnSequenceFlowKind"] or None
        if "bpmnMessageName" in patch:
            values["bpmn_message_name"] = patch["bpmnMessageName"] or None
        if "bpmnConditionExpression" in patch:
            values["bpmn_condition_expression"] = patch["bpmnConditionExpression"] or None
        if "dataContractJson" in patch:
            values["data_contract_json"] = Jsonb(patch.get("dataContractJson") or {})
        if "styleJson" in patch:
            values["style_json"] = Jsonb(patch.get("styleJson") or {})
        if "propertiesJson" in patch:
            values["properties_json"] = Jsonb(
                strip_mes_json(patch.get("propertiesJson") or {})
            )
        values.update(_semantic_fields_from_patch(patch))
        if "bpmnSemanticJson" in patch:
            semantic_candidate = dict(current_edge)
            semantic_candidate.update({
                "edge_type": patch.get("edgeType", current_edge.get("edge_type")),
                "bpmn_flow_type": patch.get("bpmnFlowType", current_edge.get("bpmn_flow_type")),
            })
            semantic_type = edge_semantic_type(semantic_candidate)
            bpmn_semantic = bpmn_semantic_payload(
                patch.get("bpmnSemanticJson"),
                semantic_type,
                patch.get("label") or current_edge.get("label"),
            )
            values["bpmn_semantic_json"] = Jsonb(bpmn_semantic)
            values["label"] = semantic_display_name(
                bpmn_semantic,
                patch.get("label") or current_edge.get("label"),
            ) or None
        if values:
            candidate = dict(current_edge)
            candidate.update(
                {
                    field: value
                    for field, value in values.items()
                    if field
                    in {
                        "edge_type",
                        "bpmn_flow_type",
                        "bpmn_sequence_flow_kind",
                        "bpmn_message_name",
                        "bpmn_condition_expression",
                    }
                }
            )
            semantic_key_value = (
                values.get("semantic_profile_key")
                if "semantic_profile_key" in values
                else current_edge.get("semantic_profile_key")
            )
            semantic_payload_value = (
                semantic_payload(patch.get("semanticPayloadJson"))
                if "semanticPayloadJson" in patch
                else current_edge.get("semantic_payload_json")
            )
            _ensure_valid_semantic_payload(
                semantic_key_value,
                semantic_payload(semantic_payload_value),
                "EDGE",
                target_key,
            )
            if current_edge["source_node_key"] and current_edge["target_node_key"]:
                source_node = _node_profile_by_key(
                    cur, business_flow_id, current_edge["source_node_key"]
                )
                target_node = _node_profile_by_key(
                    cur, business_flow_id, current_edge["target_node_key"]
                )
                _ensure_valid_edge(candidate, target_key, source_node, target_node)
            assignments = [f"{field} = %s" for field in values]
            cur.execute(
                f"""
                UPDATE business_flow_edge
                SET {", ".join(assignments)}, is_overridden = TRUE, updated_at = NOW()
                WHERE business_flow_id = %s AND edge_key = %s
                """,
                [*values.values(), business_flow_id, target_key],
            )
        return

    if op.op_type == "REMOVE_EDGE":
        cur.execute(
            """
            DELETE FROM business_flow_edge
            WHERE business_flow_id = %s AND edge_key = %s
            """,
            (business_flow_id, target_key),
        )
        return

    if op.op_type == "ADD_NODE_ER_REF":
        node_key = patch["nodeKey"]
        node = _node_profile_by_key(cur, business_flow_id, node_key)
        if not is_data_element(node):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"only BPMN data nodes can bind ER fields: {node_key}",
            )
        node_id = _resolve_node_id(cur, business_flow_id, node_key)
        cur.execute(
            """
            INSERT INTO business_flow_node_er_ref (
                business_flow_id, business_flow_node_id, er_diagram_id,
                er_table_key, er_column_key, ref_type, description
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                business_flow_id,
                node_id,
                patch["erDiagramId"],
                patch["erTableKey"],
                patch.get("erColumnKey"),
                patch.get("refType", "READ"),
                patch.get("description"),
            ),
        )
        return

    if op.op_type == "REMOVE_NODE_ER_REF":
        cur.execute(
            """
            DELETE FROM business_flow_node_er_ref
            WHERE business_flow_id = %s AND id = %s
            """,
            (business_flow_id, target_key),
        )
        return

    if op.op_type == "UPDATE_NODE_ER_REF":
        values = {}
        if "refType" in patch:
            values["ref_type"] = patch["refType"]
        if "description" in patch:
            values["description"] = patch["description"] or None
        if values:
            assignments = [f"{field} = %s" for field in values]
            cur.execute(
                f"""
                UPDATE business_flow_node_er_ref
                SET {", ".join(assignments)}
                WHERE business_flow_id = %s AND id = %s
                """,
                [*values.values(), business_flow_id, target_key],
            )
        return

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"unsupported op_type: {op.op_type}")


def _stable_json(value: Any) -> str:
    return json.dumps(value or {}, sort_keys=True, ensure_ascii=False, default=str)


def _same_text(left: Any, right: Any) -> bool:
    return (left or "") == (right or "")


def _same_number(left: Any, right: Any, tolerance: float = 0.5) -> bool:
    try:
        return abs(float(left or 0) - float(right or 0)) < tolerance
    except (TypeError, ValueError):
        return False


def _number(value: Any, fallback: float = 0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed == parsed else fallback


def _materialized_ref_signature(ref: dict[str, Any]) -> str:
    return ":".join(
        [
            str(ref.get("er_diagram_id") or ref.get("erDiagramId") or ""),
            str(ref.get("er_table_key") or ref.get("erTableKey") or ""),
            str(ref.get("er_column_key") or ref.get("erColumnKey") or ""),
        ]
    )


def _normalize_materialized_ref(ref: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": ref.get("id"),
        "er_diagram_id": ref.get("er_diagram_id") or ref.get("erDiagramId"),
        "er_table_key": ref.get("er_table_key") or ref.get("erTableKey"),
        "er_column_key": ref.get("er_column_key") or ref.get("erColumnKey") or None,
        "ref_type": ref.get("ref_type") or ref.get("refType") or "READ",
        "description": ref.get("description") or None,
    }


def _build_materialized_er_ref_ops(
    node_key: str,
    node_title: str,
    current_refs: list[dict[str, Any]],
    incoming_refs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    ops: list[dict[str, Any]] = []
    current = [_normalize_materialized_ref(ref) for ref in current_refs]
    incoming = [_normalize_materialized_ref(ref) for ref in incoming_refs]
    current_by_id = {
        str(ref["id"]): ref
        for ref in current
        if ref.get("id")
    }
    current_by_signature = {
        _materialized_ref_signature(ref): ref
        for ref in current
    }
    incoming_ids = {
        str(ref["id"])
        for ref in incoming
        if ref.get("id")
    }
    incoming_signatures = {_materialized_ref_signature(ref) for ref in incoming}

    for ref in current:
        ref_id = str(ref["id"]) if ref.get("id") else ""
        signature = _materialized_ref_signature(ref)
        if (ref_id and ref_id in incoming_ids) or signature in incoming_signatures:
            continue
        ops.append(
            {
                "op_type": "REMOVE_NODE_ER_REF",
                "target_type": "ER_REF",
                "target_key": ref_id,
                "patch": {"nodeKey": node_key, "title": node_title},
                "summary": f"移除 ER 绑定：{node_title}",
            }
        )

    for ref in incoming:
        signature = _materialized_ref_signature(ref)
        matched = (
            current_by_id.get(str(ref["id"]))
            if ref.get("id")
            else current_by_signature.get(signature)
        )
        if not matched:
            if not ref.get("er_diagram_id") or not ref.get("er_table_key"):
                continue
            ops.append(
                {
                    "op_type": "ADD_NODE_ER_REF",
                    "target_type": "ER_REF",
                    "target_key": node_key,
                    "patch": {
                        "nodeKey": node_key,
                        "erDiagramId": ref["er_diagram_id"],
                        "erTableKey": ref["er_table_key"],
                        "erColumnKey": ref.get("er_column_key"),
                        "refType": ref.get("ref_type") or "READ",
                        "description": ref.get("description"),
                    },
                    "summary": f"新增 ER 绑定：{node_title}",
                }
            )
            continue
        if (
            (matched.get("ref_type") or "READ") != (ref.get("ref_type") or "READ")
            or (matched.get("description") or "") != (ref.get("description") or "")
        ):
            ops.append(
                {
                    "op_type": "UPDATE_NODE_ER_REF",
                    "target_type": "ER_REF",
                    "target_key": str(matched["id"]),
                    "patch": {
                        "refType": ref.get("ref_type") or "READ",
                        "description": ref.get("description"),
                    },
                    "summary": f"更新 ER 绑定：{node_title}",
                }
            )
    return ops


def _edge_patch(edge: dict[str, Any]) -> dict[str, Any]:
    return {
        "sourceNodeKey": edge.get("source_node_key"),
        "targetNodeKey": edge.get("target_node_key"),
        "sourcePort": edge.get("source_port"),
        "targetPort": edge.get("target_port"),
        "edgeType": edge.get("edge_type") or "SEQUENCE",
        "bpmnFlowType": edge.get("bpmn_flow_type"),
        "bpmnSequenceFlowKind": edge.get("bpmn_sequence_flow_kind"),
        "bpmnMessageName": edge.get("bpmn_message_name"),
        "bpmnConditionExpression": edge.get("bpmn_condition_expression"),
        "label": edge.get("label"),
        "conditionText": edge.get("condition_text"),
        "dataContractJson": edge.get("data_contract_json") or {},
        "styleJson": edge.get("style_json") or {},
        "propertiesJson": strip_mes_json(edge.get("properties_json") or {}),
        "bpmnSemanticJson": edge.get("bpmn_semantic_json") or {},
        **_semantic_patch_fields(edge),
    }


def _remap_component_semantic_refs(
    payload: dict[str, Any],
    node_key_map: dict[str, str],
    edge_key_map: dict[str, str],
) -> dict[str, Any]:
    result = dict(payload)
    for key in ("defaultFlowId",):
        if result.get(key) in edge_key_map:
            result[key] = edge_key_map[result[key]]
    for key in ("expectedBranches",):
        if isinstance(result.get(key), list):
            result[key] = [edge_key_map.get(str(item), str(item)) for item in result[key]]
    for key in ("branches", "branchConditions"):
        if isinstance(result.get(key), list):
            result[key] = [
                {
                    **item,
                    "flowId": edge_key_map.get(str(item.get("flowId")), str(item.get("flowId"))),
                }
                for item in result[key]
                if isinstance(item, dict)
            ]
    for key in ("ownerActivityRef",):
        if result.get(key) in node_key_map:
            result[key] = node_key_map[result[key]]
    for key in ("readByRefs", "writeByRefs", "compensationTasks"):
        if isinstance(result.get(key), list):
            result[key] = [node_key_map.get(str(item), str(item)) for item in result[key]]
    return result


def _build_business_flow_materialize_ops(
    current_state: dict[str, Any],
    incoming_state: dict[str, Any],
) -> list[dict[str, Any]]:
    ops: list[dict[str, Any]] = []
    current_lanes = {
        lane["instance_key"]: lane
        for lane in current_state.get("lane_instances", [])
        if lane.get("instance_key")
    }
    current_lane_key_by_id = {
        str(lane.get("id")): key
        for key, lane in current_lanes.items()
        if lane.get("id")
    }
    incoming_lanes = {
        lane["instance_key"]: lane
        for lane in incoming_state.get("lane_instances", [])
        if lane.get("instance_key")
    }
    lane_key_by_id = {
        str(lane.get("id")): key
        for key, lane in incoming_lanes.items()
        if lane.get("id")
    }

    for key, lane in incoming_lanes.items():
        current = current_lanes.get(key)
        if not current:
            continue
        if (
            not _same_number(current.get("position_x"), lane.get("position_x"))
            or not _same_number(current.get("position_y"), lane.get("position_y"))
            or not _same_number(current.get("width"), lane.get("width"))
            or not _same_number(current.get("height"), lane.get("height"))
            or _stable_json(current.get("layout_json")) != _stable_json(lane.get("layout_json"))
        ):
            ops.append(
                {
                    "op_type": "MOVE_LANE_INSTANCE",
                    "target_type": "LANE_INSTANCE",
                    "target_key": key,
                    "patch": {
                        "to": {
                            "x": _number(lane.get("position_x")),
                            "y": _number(lane.get("position_y")),
                            "width": _number(lane.get("width"), 360),
                            "height": _number(lane.get("height"), 360),
                        },
                        "layoutJson": lane.get("layout_json") or {},
                    },
                    "summary": f"移动泳道：{lane.get('display_name') or key}",
                }
            )
        if (
            not _same_text(current.get("display_name"), lane.get("display_name"))
            or not _same_text(current.get("owner_role"), lane.get("owner_role"))
        ):
            ops.append(
                {
                    "op_type": "RENAME_LANE_INSTANCE",
                    "target_type": "LANE_INSTANCE",
                    "target_key": key,
                    "patch": {
                        "displayName": lane.get("display_name") or "泳道实例",
                        "ownerRole": lane.get("owner_role"),
                    },
                    "summary": f"更新泳道：{lane.get('display_name') or key}",
                }
            )

    current_nodes = {
        node["node_key"]: node
        for node in current_state.get("nodes", [])
        if node.get("node_key")
    }
    incoming_nodes = {
        node["node_key"]: node
        for node in incoming_state.get("nodes", [])
        if node.get("node_key")
    }
    for key, node in incoming_nodes.items():
        _ensure_valid_node(node, key)
        _ensure_valid_semantic_payload(
            semantic_profile_key(node.get("semantic_profile_key")),
            semantic_payload(node.get("semantic_payload_json")),
            "NODE",
            key,
        )
    structure_error = container_structure_error(list(incoming_nodes.values()))
    if structure_error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid process container structure: {structure_error}",
        )
    for key, node in current_nodes.items():
        if key not in incoming_nodes:
            ops.append(
                {
                    "op_type": "REMOVE_NODE",
                    "target_type": "NODE",
                    "target_key": key,
                    "patch": {"title": node.get("title")},
                    "summary": f"删除节点：{node.get('title') or key}",
                }
            )
    for key, node in incoming_nodes.items():
        current = current_nodes.get(key)
        lane_key = node.get("lane_instance_key") or lane_key_by_id.get(str(node.get("lane_instance_id") or ""))
        if not current:
            if not lane_key:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"materialized node missing lane: {key}",
                )
            ops.append(
                {
                    "op_type": "ADD_NODE",
                    "target_type": "NODE",
                    "target_key": key,
                    "patch": {
                        "laneInstanceKey": lane_key,
                        "nodeType": node.get("node_type") or "TASK",
                        "bpmnElementType": node.get("bpmn_element_type"),
                        "bpmnEventKind": node.get("bpmn_event_kind"),
                        "bpmnEventDefinition": node.get("bpmn_event_definition"),
                        "bpmnTaskType": node.get("bpmn_task_type"),
                        "bpmnGatewayType": node.get("bpmn_gateway_type"),
                        "bpmnSubProcessKind": node.get("bpmn_subprocess_kind"),
                        "bpmnCallActivityRef": node.get("bpmn_call_activity_ref"),
                        "title": node.get("title") or "任务",
                        "x": _number(node.get("position_x")),
                        "y": _number(node.get("position_y")),
                        "width": _number(node.get("width"), 120),
                        "height": _number(node.get("height"), 60),
                        "description": node.get("description"),
                        "actor": node.get("actor"),
                        "businessRule": node.get("business_rule"),
                        "inputSummary": node.get("input_summary"),
                        "outputSummary": node.get("output_summary"),
                        "styleJson": node.get("style_json") or {},
                        "propertiesJson": strip_mes_json(node.get("properties_json") or {}),
                        "bpmnSemanticJson": node.get("bpmn_semantic_json") or {},
                        **_semantic_patch_fields(node),
                        **_node_context_patch_fields(node),
                    },
                    "summary": f"新增节点：{node.get('title') or key}",
                }
            )
            ops.extend(
                _build_materialized_er_ref_ops(
                    key,
                    node.get("title") or key,
                    [],
                    (node.get("er_refs") or []) if is_data_element(node) else [],
                )
            )
            continue
        patch: dict[str, Any] = {}
        if (
            not _same_number(current.get("position_x"), node.get("position_x"))
            or not _same_number(current.get("position_y"), node.get("position_y"))
            or not _same_number(current.get("width"), node.get("width"))
            or not _same_number(current.get("height"), node.get("height"))
        ):
            patch["to"] = {
                "x": _number(node.get("position_x")),
                "y": _number(node.get("position_y")),
                "width": _number(node.get("width"), 120),
                "height": _number(node.get("height"), 60),
            }
        current_lane_key = current_lane_key_by_id.get(str(current.get("lane_instance_id") or ""))
        if lane_key and current_lane_key and lane_key != current_lane_key:
            patch["laneInstanceKey"] = lane_key
        if not _same_text(current.get("title"), node.get("title")):
            patch["title"] = node.get("title") or "任务"
        if not _same_text(current.get("description"), node.get("description")):
            patch["description"] = node.get("description")
        if not _same_text(current.get("actor"), node.get("actor")):
            patch["actor"] = node.get("actor")
        if not _same_text(current.get("business_rule"), node.get("business_rule")):
            patch["businessRule"] = node.get("business_rule")
        if not _same_text(current.get("input_summary"), node.get("input_summary")):
            patch["inputSummary"] = node.get("input_summary")
        if not _same_text(current.get("output_summary"), node.get("output_summary")):
            patch["outputSummary"] = node.get("output_summary")
        for client_key, field in [
            ("nodeType", "node_type"),
            ("bpmnElementType", "bpmn_element_type"),
            ("bpmnEventKind", "bpmn_event_kind"),
            ("bpmnEventDefinition", "bpmn_event_definition"),
            ("bpmnTaskType", "bpmn_task_type"),
            ("bpmnGatewayType", "bpmn_gateway_type"),
            ("bpmnSubProcessKind", "bpmn_subprocess_kind"),
            ("bpmnCallActivityRef", "bpmn_call_activity_ref"),
        ]:
            if not _same_text(current.get(field), node.get(field)):
                patch[client_key] = node.get(field)
        if _stable_json(current.get("style_json")) != _stable_json(node.get("style_json")):
            patch["styleJson"] = node.get("style_json") or {}
        if _stable_json(current.get("properties_json")) != _stable_json(node.get("properties_json")):
            patch["propertiesJson"] = strip_mes_json(node.get("properties_json") or {})
        if not _same_text(current.get("semantic_profile_key"), node.get("semantic_profile_key")):
            patch["semanticProfileKey"] = node.get("semantic_profile_key")
        if (current.get("semantic_profile_version") or None) != (node.get("semantic_profile_version") or None):
            patch["semanticProfileVersion"] = node.get("semantic_profile_version")
        if _stable_json(current.get("semantic_payload_json")) != _stable_json(node.get("semantic_payload_json")):
            patch["semanticPayloadJson"] = semantic_payload(node.get("semantic_payload_json"))
        if _stable_json(current.get("bpmn_semantic_json")) != _stable_json(node.get("bpmn_semantic_json")):
            patch["bpmnSemanticJson"] = node.get("bpmn_semantic_json") or {}
        if _stable_json(current.get("task_ui_json")) != _stable_json(node.get("task_ui_json")):
            patch["taskUiJson"] = task_ui_payload(node.get("task_ui_json"))
        if _stable_json(current.get("process_container_json")) != _stable_json(node.get("process_container_json")):
            patch["processContainerJson"] = process_container_payload(node.get("process_container_json"))
        if not _same_text(current.get("container_node_key"), node.get("container_node_key")):
            patch["containerNodeKey"] = node.get("container_node_key")
        if patch:
            ops.append(
                {
                    "op_type": "UPDATE_NODE",
                    "target_type": "NODE",
                    "target_key": key,
                    "patch": patch,
                    "summary": f"更新节点：{node.get('title') or key}",
                }
            )
        ops.extend(
            _build_materialized_er_ref_ops(
                key,
                node.get("title") or key,
                (current.get("er_refs") or []) if is_data_element(current) else [],
                (node.get("er_refs") or []) if is_data_element(node) else [],
            )
        )

    current_edges = {
        edge["edge_key"]: edge
        for edge in current_state.get("edges", [])
        if edge.get("edge_key")
    }
    incoming_edges = {
        edge["edge_key"]: edge
        for edge in incoming_state.get("edges", [])
        if edge.get("edge_key")
    }
    for key, edge in current_edges.items():
        if key not in incoming_edges:
            ops.append(
                {
                    "op_type": "REMOVE_EDGE",
                    "target_type": "EDGE",
                    "target_key": key,
                    "patch": {"label": edge.get("label")},
                    "summary": f"删除连线：{edge.get('label') or key}",
                }
            )
    for key, edge in incoming_edges.items():
        if edge.get("source_type", "NODE") != "NODE" or edge.get("target_type", "NODE") != "NODE":
            continue
        source_node = incoming_nodes.get(edge.get("source_node_key") or "")
        target_node = incoming_nodes.get(edge.get("target_node_key") or "")
        if not source_node or not target_node:
            continue
        _ensure_valid_edge(edge, key, source_node, target_node)
        _ensure_valid_semantic_payload(
            semantic_profile_key(edge.get("semantic_profile_key")),
            semantic_payload(edge.get("semantic_payload_json")),
            "EDGE",
            key,
        )
        current = current_edges.get(key)
        patch = _edge_patch(edge)
        if not current:
            ops.append(
                {
                    "op_type": "ADD_EDGE",
                    "target_type": "EDGE",
                    "target_key": key,
                    "patch": patch,
                    "summary": f"新增连线：{edge.get('label') or key}",
                }
            )
            continue
        endpoint_changed = (
            (current.get("source_node_key") or "") != (edge.get("source_node_key") or "")
            or (current.get("target_node_key") or "") != (edge.get("target_node_key") or "")
        )
        changed = endpoint_changed or any(
            (current.get(field) or "") != (edge.get(field) or "")
            for field in [
                "source_port",
                "target_port",
                "edge_type",
                "label",
                "condition_text",
                "bpmn_flow_type",
                "bpmn_sequence_flow_kind",
                "bpmn_message_name",
                "bpmn_condition_expression",
            ]
        )
        changed = changed or _stable_json(current.get("data_contract_json")) != _stable_json(edge.get("data_contract_json"))
        changed = changed or _stable_json(current.get("style_json")) != _stable_json(edge.get("style_json"))
        changed = changed or _stable_json(current.get("properties_json")) != _stable_json(edge.get("properties_json"))
        changed = changed or not _same_text(current.get("semantic_profile_key"), edge.get("semantic_profile_key"))
        changed = changed or (current.get("semantic_profile_version") or None) != (edge.get("semantic_profile_version") or None)
        changed = changed or _stable_json(current.get("semantic_payload_json")) != _stable_json(edge.get("semantic_payload_json"))
        changed = changed or _stable_json(current.get("bpmn_semantic_json")) != _stable_json(edge.get("bpmn_semantic_json"))
        if changed:
            ops.append(
                {
                    "op_type": "ADD_EDGE" if endpoint_changed else "UPDATE_EDGE",
                    "target_type": "EDGE",
                    "target_key": key,
                    "patch": patch,
                    "summary": f"更新连线：{edge.get('label') or key}",
                }
            )
    return ops


@router.get("/{business_flow_id}/editor-state", response_model=BusinessFlowEditorStateResponse)
def get_business_flow_editor_state(
    business_flow_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowEditorStateResponse:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "viewer")
            return _fetch_business_flow_editor_state(cur, business_flow_id)


@router.post("/{business_flow_id}/lane-instances", response_model=PlaceSwimlaneComponentResponse)
def place_swimlane_component(
    business_flow_id: UUID,
    body: PlaceSwimlaneComponentPayload,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> PlaceSwimlaneComponentResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "editor")
            cur.execute(
                """
                SELECT id, product_id, current_version
                FROM business_flow
                WHERE id = %s AND status <> 'ARCHIVED'
                FOR UPDATE
                """,
                (business_flow_id,),
            )
            flow = cur.fetchone()
            if not flow:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"business flow not found: {business_flow_id}",
                )
            cur.execute(
                """
                SELECT sc.id AS component_id, sc.name, sc.owner_role, sc.product_id,
                       scv.id AS version_id, scv.version_no
                FROM swimlane_component_version scv
                JOIN swimlane_component sc ON sc.id = scv.component_id
                WHERE scv.id = %s
                  AND scv.status = 'PUBLISHED'
                  AND sc.status = 'PUBLISHED'
                  AND sc.deleted_at IS NULL
                """,
                (body.component_version_id,),
            )
            component = cur.fetchone()
            if not component:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="published swimlane component version not found")
            if component["product_id"] != flow["product_id"]:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="swimlane component product mismatch")

            cur.execute(
                """
                SELECT id, node_key, node_type, title, description, actor, business_rule,
                       input_summary, output_summary, position_x, position_y, width, height,
                       bpmn_element_type, bpmn_event_kind, bpmn_event_definition,
                       bpmn_task_type, bpmn_gateway_type, bpmn_subprocess_kind,
                       bpmn_call_activity_ref,
                       style_json, properties_json,
                       semantic_profile_key, semantic_profile_version, semantic_payload_json,
                       bpmn_semantic_json,
                       task_ui_json, process_container_json, container_node_key
                FROM swimlane_component_node
                WHERE component_version_id = %s
                ORDER BY created_at ASC, node_key ASC
                """,
                (body.component_version_id,),
            )
            component_nodes = cur.fetchall()
            refs_by_component_node_id: dict[UUID, list[dict]] = {}
            if component_nodes:
                cur.execute(
                    """
                    SELECT swimlane_component_node_id, er_diagram_id, er_table_key,
                           er_column_key, ref_type, description
                    FROM swimlane_component_node_er_ref
                    WHERE swimlane_component_node_id = ANY(%s)
                    ORDER BY created_at ASC, er_table_key ASC, er_column_key ASC
                    """,
                    ([node["id"] for node in component_nodes],),
                )
                for ref in cur.fetchall():
                    refs_by_component_node_id.setdefault(
                        ref["swimlane_component_node_id"],
                        [],
                    ).append(ref)
            cur.execute(
                """
                SELECT edge_key, source_node_key, target_node_key, source_port, target_port,
                       edge_type, label, condition_text, bpmn_flow_type,
                       bpmn_sequence_flow_kind, bpmn_message_name,
                       bpmn_condition_expression, data_contract_json,
                       style_json, properties_json,
                       semantic_profile_key, semantic_profile_version, semantic_payload_json
                       , bpmn_semantic_json
                FROM swimlane_component_edge
                WHERE component_version_id = %s
                ORDER BY created_at ASC, edge_key ASC
                """,
                (body.component_version_id,),
            )
            component_edges = cur.fetchall()
            component_nodes_by_key = {
                node["node_key"]: dict(node) for node in component_nodes
            }
            for node_key, component_node in component_nodes_by_key.items():
                _ensure_valid_node(component_node, node_key)
                _ensure_valid_semantic_payload(
                    semantic_profile_key(component_node.get("semantic_profile_key")),
                    semantic_payload(component_node.get("semantic_payload_json")),
                    "NODE",
                    node_key,
                )
            for component_edge in component_edges:
                _ensure_valid_edge(
                    dict(component_edge),
                    component_edge["edge_key"],
                    component_nodes_by_key[component_edge["source_node_key"]],
                    component_nodes_by_key[component_edge["target_node_key"]],
                )
                _ensure_valid_semantic_payload(
                    semantic_profile_key(component_edge.get("semantic_profile_key")),
                    semantic_payload(component_edge.get("semantic_payload_json")),
                    "EDGE",
                    component_edge["edge_key"],
                )

            lane_key = f"lane_{uuid4().hex[:14]}"
            x = float(body.position.get("x", 0))
            y = float(body.position.get("y", 0))
            min_x = min([float(node["position_x"]) for node in component_nodes], default=0)
            min_y = min([float(node["position_y"]) for node in component_nodes], default=0)
            max_x = max(
                [float(node["position_x"]) + float(node["width"]) for node in component_nodes],
                default=304,
            )
            max_y = max(
                [float(node["position_y"]) + float(node["height"]) for node in component_nodes],
                default=264,
            )
            content_width = max(0, max_x - min_x)
            content_height = max(0, max_y - min_y)
            width = max(LANE_MIN_WIDTH, content_width + LANE_PADDING_LEFT + LANE_PADDING_RIGHT)
            height = max(LANE_MIN_HEIGHT, content_height + LANE_HEADER_HEIGHT + LANE_PADDING_BOTTOM)
            layout_json = {
                "sizePolicy": {
                    "autoWidth": width,
                    "autoHeight": height,
                }
            }
            cur.execute(
                """
                SELECT COALESCE(MAX(z_index), 0) + 1 AS next_z
                FROM business_flow_lane_instance
                WHERE business_flow_id = %s
                """,
                (business_flow_id,),
            )
            z_index = int(cur.fetchone()["next_z"])
            cur.execute(
                """
                INSERT INTO business_flow_lane_instance (
                    business_flow_id, instance_key, component_id, component_version_id,
                    display_name, owner_role, position_x, position_y, width, height,
                    z_index, layout_json, created_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    business_flow_id,
                    lane_key,
                    component["component_id"],
                    component["version_id"],
                    component["name"],
                    component["owner_role"],
                    x,
                    y,
                    width,
                    height,
                    z_index,
                    Jsonb(layout_json),
                    str(user.id),
                ),
            )
            lane_id = cur.fetchone()["id"]
            node_key_map: dict[str, str] = {}
            node_id_map: dict[str, UUID] = {}
            edge_key_map = {
                edge["edge_key"]: f"{lane_key}_{edge['edge_key']}"
                for edge in component_edges
            }
            for component_node in component_nodes:
                node_key_map[component_node["node_key"]] = f"{lane_key}_{component_node['node_key']}"
            for component_node in component_nodes:
                node_key = node_key_map[component_node["node_key"]]
                semantic_type = node_semantic_type(component_node)
                bpmn_semantic = bpmn_semantic_payload(
                    component_node.get("bpmn_semantic_json"),
                    semantic_type,
                    component_node.get("title"),
                )
                bpmn_semantic = _remap_component_semantic_refs(
                    bpmn_semantic,
                    node_key_map,
                    edge_key_map,
                )
                title = (
                    semantic_display_name(bpmn_semantic, component_node.get("title"))
                    if semantic_type
                    else component_node.get("title")
                )
                container_node_key = (
                    node_key_map.get(component_node.get("container_node_key"))
                    if component_node.get("container_node_key")
                    else None
                )
                node_position_x = (
                    float(component_node["position_x"])
                    if container_node_key
                    else LANE_PADDING_LEFT + (float(component_node["position_x"]) - min_x)
                )
                node_position_y = (
                    float(component_node["position_y"])
                    if container_node_key
                    else LANE_HEADER_HEIGHT + (float(component_node["position_y"]) - min_y)
                )
                cur.execute(
                    """
                    INSERT INTO business_flow_node (
                        business_flow_id, lane_instance_id, node_key,
                        origin_component_node_key, node_type, title, description,
                        actor, business_rule, input_summary, output_summary,
                        bpmn_element_type, bpmn_event_kind, bpmn_event_definition,
                        bpmn_task_type, bpmn_gateway_type, bpmn_subprocess_kind,
                        bpmn_call_activity_ref,
                        position_x, position_y, width, height, style_json, properties_json,
                        semantic_profile_key, semantic_profile_version, semantic_payload_json,
                        bpmn_semantic_json,
                        task_ui_json, process_container_json, container_node_key
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        business_flow_id,
                        lane_id,
                        node_key,
                        component_node["node_key"],
                        component_node["node_type"],
                        title,
                        None if semantic_type else component_node["description"],
                        None if semantic_type else component_node["actor"],
                        None if semantic_type else component_node["business_rule"],
                        None if semantic_type else component_node["input_summary"],
                        None if semantic_type else component_node["output_summary"],
                        component_node.get("bpmn_element_type"),
                        component_node.get("bpmn_event_kind"),
                        component_node.get("bpmn_event_definition"),
                        component_node.get("bpmn_task_type"),
                        component_node.get("bpmn_gateway_type"),
                        component_node.get("bpmn_subprocess_kind"),
                        component_node.get("bpmn_call_activity_ref"),
                        node_position_x,
                        node_position_y,
                        float(component_node["width"]),
                        float(component_node["height"]),
                        Jsonb(component_node.get("style_json") or {}),
                        Jsonb(strip_mes_json(component_node.get("properties_json") or {})),
                        component_node.get("semantic_profile_key"),
                        component_node.get("semantic_profile_version"),
                        Jsonb(semantic_payload(component_node.get("semantic_payload_json"))),
                        Jsonb(bpmn_semantic),
                        Jsonb(task_ui_payload(component_node.get("task_ui_json"))),
                        Jsonb(process_container_payload(component_node.get("process_container_json"))),
                        container_node_key,
                    ),
                )
                node_id = cur.fetchone()["id"]
                node_id_map[component_node["node_key"]] = node_id
                for ref in (
                    refs_by_component_node_id.get(component_node["id"], [])
                    if is_data_element(component_node)
                    else []
                ):
                    cur.execute(
                        """
                        INSERT INTO business_flow_node_er_ref (
                            business_flow_id, business_flow_node_id, er_diagram_id,
                            er_table_key, er_column_key, ref_type, description, created_by
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            business_flow_id,
                            node_id,
                            ref["er_diagram_id"],
                            ref["er_table_key"],
                            ref["er_column_key"],
                            ref["ref_type"],
                            ref["description"],
                            str(user.id),
                        ),
                    )
            for component_edge in component_edges:
                source_node_key = node_key_map.get(component_edge["source_node_key"])
                target_node_key = node_key_map.get(component_edge["target_node_key"])
                source_node_id = node_id_map.get(component_edge["source_node_key"])
                target_node_id = node_id_map.get(component_edge["target_node_key"])
                if not source_node_key or not target_node_key or not source_node_id or not target_node_id:
                    continue
                edge_semantic = bpmn_semantic_payload(
                    component_edge.get("bpmn_semantic_json"),
                    edge_semantic_type(component_edge),
                    component_edge.get("label"),
                )
                edge_label = semantic_display_name(
                    edge_semantic,
                    component_edge.get("label"),
                ) or None
                cur.execute(
                    """
                    INSERT INTO business_flow_edge (
                        business_flow_id, lane_instance_id, edge_key, source_type,
                        source_node_id, source_port, target_type, target_node_id,
                        target_port, edge_type, label, condition_text, data_contract_json,
                        bpmn_flow_type, bpmn_sequence_flow_kind, bpmn_message_name,
                        bpmn_condition_expression,
                        origin_component_edge_key, style_json, properties_json,
                        semantic_profile_key, semantic_profile_version, semantic_payload_json
                        , bpmn_semantic_json
                    )
                    VALUES (%s, %s, %s, 'NODE', %s, %s, 'NODE', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        business_flow_id,
                        lane_id,
                        edge_key_map[component_edge["edge_key"]],
                        source_node_id,
                        component_edge["source_port"],
                        target_node_id,
                        component_edge["target_port"],
                        component_edge["edge_type"],
                        edge_label,
                        component_edge["condition_text"],
                        Jsonb(component_edge.get("data_contract_json") or {}),
                        component_edge.get("bpmn_flow_type"),
                        component_edge.get("bpmn_sequence_flow_kind"),
                        component_edge.get("bpmn_message_name"),
                        component_edge.get("bpmn_condition_expression"),
                        component_edge["edge_key"],
                        Jsonb(component_edge.get("style_json") or {}),
                        Jsonb(strip_mes_json(component_edge.get("properties_json") or {})),
                        component_edge.get("semantic_profile_key"),
                        component_edge.get("semantic_profile_version"),
                        Jsonb(semantic_payload(component_edge.get("semantic_payload_json"))),
                        Jsonb(
                            edge_semantic
                        ),
                    ),
                )

            _normalize_business_flow_lane_bounds(cur, business_flow_id)
            base_version = int(flow["current_version"])
            new_version = base_version + 1
            cur.execute(
                """
                UPDATE business_flow
                SET current_version = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (new_version, business_flow_id),
            )
            _append_change_batch(
                cur,
                business_flow_id,
                base_version,
                new_version,
                "USER",
                f"添加泳道：{component['name']}",
                [
                    {
                        "op_type": "ADD_LANE_INSTANCE",
                        "target_type": "LANE_INSTANCE",
                        "target_key": lane_key,
                        "patch": {
                            "componentVersionId": str(body.component_version_id),
                            "x": x,
                            "y": y,
                        },
                        "inverse_patch": {"removeLaneInstanceKey": lane_key},
                        "summary": f"添加泳道：{component['name']}",
                    }
                ],
                user.id,
            )
            _write_business_flow_snapshot(cur, business_flow_id, new_version, user.id)
            state = _fetch_business_flow_editor_state(cur, business_flow_id)
            lane = next(item for item in state.lane_instances if item.id == lane_id)
            nodes = [node for node in state.nodes if node.lane_instance_id == lane_id]
            node_ids = {node.id for node in nodes}
            edges = [
                edge
                for edge in state.edges
                if edge.lane_instance_id == lane_id
                or edge.source_node_id in node_ids
                or edge.target_node_id in node_ids
            ]
            return PlaceSwimlaneComponentResponse(
                lane_instance=lane,
                nodes=nodes,
                edges=edges,
                new_version=new_version,
            )


@router.patch("/{business_flow_id}/changes", response_model=ApplyBusinessFlowChangesResponse)
def apply_business_flow_changes(
    business_flow_id: UUID,
    body: ApplyBusinessFlowChangesRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> ApplyBusinessFlowChangesResponse:
    if not body.ops:
        return ApplyBusinessFlowChangesResponse(new_version=body.base_version, summary="无变更")
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "editor")
            cur.execute(
                """
                SELECT current_version
                FROM business_flow
                WHERE id = %s AND status <> 'ARCHIVED'
                FOR UPDATE
                """,
                (business_flow_id,),
            )
            flow = cur.fetchone()
            if not flow:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"business flow not found: {business_flow_id}")
            current_version = int(flow["current_version"])
            if current_version != body.base_version:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"business flow version conflict: current={current_version}, base={body.base_version}",
                )
            for op in body.ops:
                _apply_business_flow_op(cur, business_flow_id, op)
            _normalize_business_flow_lane_bounds(cur, business_flow_id)
            new_version = current_version + 1
            summary = f"更新了 {len(body.ops)} 项内容"
            cur.execute(
                """
                UPDATE business_flow
                SET current_version = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (new_version, business_flow_id),
            )
            _append_change_batch(
                cur,
                business_flow_id,
                current_version,
                new_version,
                body.source,
                summary,
                [op.model_dump(mode="json") for op in body.ops],
                user.id,
            )
            _write_business_flow_snapshot(cur, business_flow_id, new_version, user.id)
            return ApplyBusinessFlowChangesResponse(new_version=new_version, summary=summary)


@router.post("/{business_flow_id}/internal/materialize", response_model=ApplyBusinessFlowChangesResponse)
def materialize_business_flow_from_collab(
    business_flow_id: UUID,
    body: dict[str, Any],
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> ApplyBusinessFlowChangesResponse:
    ensure_internal_token(x_internal_token)
    if body.get("business_flow_id") and str(body["business_flow_id"]) != str(business_flow_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="business flow id mismatch",
        )
    with db_transaction() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT current_version, collab_revision
                FROM business_flow
                WHERE id = %s AND status <> 'ARCHIVED'
                FOR UPDATE
                """,
                (business_flow_id,),
            )
            flow = cur.fetchone()
            if not flow:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"business flow not found: {business_flow_id}",
                )

            current_revision = int(flow.get("collab_revision") or 1)
            try:
                incoming_revision = int(body.get("collabRevision"))
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="collabRevision is required",
                ) from None
            if incoming_revision != current_revision:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "business flow collaboration revision conflict: "
                        f"current={current_revision}, incoming={incoming_revision}"
                    ),
                )

            current_version = int(flow["current_version"])
            current_state = _fetch_business_flow_editor_state(cur, business_flow_id).model_dump(mode="json")
            incoming_state = {
                "lane_instances": body.get("lane_instances") or [],
                "nodes": body.get("nodes") or [],
                "edges": body.get("edges") or [],
            }
            ops = _build_business_flow_materialize_ops(current_state, incoming_state)
            if not ops:
                return ApplyBusinessFlowChangesResponse(new_version=current_version, summary="无变更")

            for op in ops:
                _apply_business_flow_op(cur, business_flow_id, BusinessFlowChangeOpPayload(**op))
            _normalize_business_flow_lane_bounds(cur, business_flow_id)
            new_version = current_version + 1
            summary = f"协同更新了 {len(ops)} 项内容"
            cur.execute(
                """
                UPDATE business_flow
                SET current_version = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (new_version, business_flow_id),
            )
            actor_id = body.get("userId") or body.get("clientId") or "collab"
            _append_change_batch(
                cur,
                business_flow_id,
                current_version,
                new_version,
                body.get("operationSource") or "collab_auto_save",
                summary,
                ops,
                actor_id,
            )
            _write_business_flow_snapshot(cur, business_flow_id, new_version, actor_id)
            return ApplyBusinessFlowChangesResponse(new_version=new_version, summary=summary)


@router.get("/{business_flow_id}/history", response_model=list[BusinessFlowHistoryItemDTO])
def get_business_flow_history(
    business_flow_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[BusinessFlowHistoryItemDTO]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "viewer")
            cur.execute(
                """
                SELECT id, base_version, new_version, source, summary, created_by, created_at
                FROM business_flow_change_batch
                WHERE business_flow_id = %s
                ORDER BY new_version DESC
                LIMIT 100
                """,
                (business_flow_id,),
            )
            batches = cur.fetchall()
            results = []
            for batch in batches:
                cur.execute(
                    """
                    SELECT op_type, target_type, target_key, summary
                    FROM business_flow_change_op
                    WHERE batch_id = %s
                    ORDER BY op_seq ASC
                    """,
                    (batch["id"],),
                )
                results.append(
                    {
                        "version": int(batch["new_version"]),
                        "base_version": int(batch["base_version"]),
                        "source": batch["source"],
                        "summary": batch["summary"],
                        "created_by": batch["created_by"],
                        "created_at": batch["created_at"].isoformat(),
                        "ops": cur.fetchall(),
                    }
                )
            return results


@router.post("/{business_flow_id}/restore", response_model=RestoreBusinessFlowResponse)
def restore_business_flow(
    business_flow_id: UUID,
    body: RestoreBusinessFlowRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> RestoreBusinessFlowResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "editor")
            cur.execute(
                """
                SELECT current_version
                FROM business_flow
                WHERE id = %s AND status <> 'ARCHIVED'
                FOR UPDATE
                """,
                (business_flow_id,),
            )
            flow = cur.fetchone()
            if not flow:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"business flow not found: {business_flow_id}")
            cur.execute(
                """
                SELECT semantic_json
                FROM business_flow_snapshot
                WHERE business_flow_id = %s AND version = %s
                """,
                (business_flow_id, body.target_version),
            )
            snapshot = cur.fetchone()
            if not snapshot:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"snapshot not found: {body.target_version}")
            semantic = snapshot.get("semantic_json") or {}
            lanes = strip_mes_json(semantic.get("lanes") or [])
            nodes = [
                strip_mes_json(node)
                for node in semantic.get("nodes") or []
                if not node_profile_error(node)
            ]
            nodes_by_key = {
                node["node_key"]: node for node in nodes if node.get("node_key")
            }
            structure_error = container_structure_error(list(nodes_by_key.values()))
            if structure_error:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"invalid process container structure: {structure_error}",
                )
            edges = []
            for edge in semantic.get("edges") or []:
                clean_edge = strip_mes_json(edge)
                source_node = nodes_by_key.get(clean_edge.get("source_node_key") or "")
                target_node = nodes_by_key.get(clean_edge.get("target_node_key") or "")
                if clean_edge.get("source_type", "NODE") == "NODE" and not source_node:
                    continue
                if clean_edge.get("target_type", "NODE") == "NODE" and not target_node:
                    continue
                if edge_profile_error(clean_edge, source_node, target_node):
                    continue
                edges.append(clean_edge)
            cur.execute("DELETE FROM business_flow_edge WHERE business_flow_id = %s", (business_flow_id,))
            cur.execute("DELETE FROM business_flow_node_er_ref WHERE business_flow_id = %s", (business_flow_id,))
            cur.execute("DELETE FROM business_flow_node WHERE business_flow_id = %s", (business_flow_id,))
            cur.execute("DELETE FROM business_flow_lane_instance WHERE business_flow_id = %s", (business_flow_id,))
            lane_id_by_old_id: dict[str, UUID] = {}
            lane_id_by_key: dict[str, UUID] = {}
            for lane in lanes:
                cur.execute(
                    """
                    INSERT INTO business_flow_lane_instance (
                        business_flow_id, instance_key, component_id, component_version_id,
                        display_name, owner_role, position_x, position_y, width, height,
                        z_index, layout_json, override_json, status, created_by
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'ACTIVE', %s)
                    RETURNING id
                    """,
                    (
                        business_flow_id,
                        lane["instance_key"],
                        lane["component_id"],
                        lane["component_version_id"],
                        lane["display_name"],
                        lane.get("owner_role"),
                        lane.get("position_x", 0),
                        lane.get("position_y", 0),
                        lane.get("width", 360),
                        lane.get("height", 360),
                        lane.get("z_index", 0),
                        Jsonb(lane.get("layout_json") or {}),
                        Jsonb(lane.get("override_json") or {}),
                        str(user.id),
                    ),
                )
                new_lane_id = cur.fetchone()["id"]
                lane_id_by_old_id[str(lane["id"])] = new_lane_id
                lane_id_by_key[lane["instance_key"]] = new_lane_id
            node_id_by_old_id: dict[str, UUID] = {}
            node_id_by_key: dict[str, UUID] = {}
            for node in nodes:
                semantic_type = node_semantic_type(node)
                bpmn_semantic = bpmn_semantic_payload(
                    node.get("bpmn_semantic_json"),
                    semantic_type,
                    node.get("title"),
                )
                title = (
                    semantic_display_name(bpmn_semantic, node.get("title"))
                    if semantic_type
                    else node.get("title")
                )
                _ensure_valid_semantic_payload(
                    semantic_profile_key(node.get("semantic_profile_key")),
                    semantic_payload(node.get("semantic_payload_json")),
                    "NODE",
                    node.get("node_key") or "",
                )
                lane_id = lane_id_by_old_id.get(str(node.get("lane_instance_id") or "")) or lane_id_by_key.get(node.get("lane_instance_key") or "")
                cur.execute(
                    """
                    INSERT INTO business_flow_node (
                        business_flow_id, lane_instance_id, node_key, origin_component_node_key,
                        node_type, title, description, actor, business_rule, input_summary,
                        bpmn_element_type, bpmn_event_kind, bpmn_event_definition,
                        bpmn_task_type, bpmn_gateway_type, bpmn_subprocess_kind,
                        bpmn_call_activity_ref,
                        output_summary, position_x, position_y, width, height, is_overridden,
                        style_json, properties_json,
                        semantic_profile_key, semantic_profile_version, semantic_payload_json,
                        bpmn_semantic_json,
                        task_ui_json, process_container_json, container_node_key
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        business_flow_id,
                        lane_id,
                        node["node_key"],
                        node.get("origin_component_node_key"),
                        node["node_type"],
                        title,
                        None if semantic_type else node.get("description"),
                        None if semantic_type else node.get("actor"),
                        None if semantic_type else node.get("business_rule"),
                        None if semantic_type else node.get("input_summary"),
                        node.get("bpmn_element_type"),
                        node.get("bpmn_event_kind"),
                        node.get("bpmn_event_definition"),
                        node.get("bpmn_task_type"),
                        node.get("bpmn_gateway_type"),
                        node.get("bpmn_subprocess_kind"),
                        node.get("bpmn_call_activity_ref"),
                        None if semantic_type else node.get("output_summary"),
                        node.get("position_x", 0),
                        node.get("position_y", 0),
                        node.get("width", 120),
                        node.get("height", 60),
                        bool(node.get("is_overridden")),
                        Jsonb(node.get("style_json") or {}),
                        Jsonb(strip_mes_json(node.get("properties_json") or {})),
                        node.get("semantic_profile_key"),
                        node.get("semantic_profile_version"),
                        Jsonb(semantic_payload(node.get("semantic_payload_json"))),
                        Jsonb(bpmn_semantic),
                        Jsonb(task_ui_payload(node.get("task_ui_json"))),
                        Jsonb(process_container_payload(node.get("process_container_json"))),
                        node.get("container_node_key"),
                    ),
                )
                new_node_id = cur.fetchone()["id"]
                node_id_by_old_id[str(node["id"])] = new_node_id
                node_id_by_key[node["node_key"]] = new_node_id
                for ref in (node.get("er_refs") or []) if is_data_element(node) else []:
                    cur.execute(
                        """
                        INSERT INTO business_flow_node_er_ref (
                            business_flow_id, business_flow_node_id, er_diagram_id,
                            er_table_key, er_column_key, ref_type, description, created_by
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            business_flow_id,
                            new_node_id,
                            ref["er_diagram_id"],
                            ref["er_table_key"],
                            ref.get("er_column_key"),
                            ref.get("ref_type", "READ"),
                            ref.get("description"),
                            str(user.id),
                        ),
                    )
            for edge in edges:
                _ensure_valid_semantic_payload(
                    semantic_profile_key(edge.get("semantic_profile_key")),
                    semantic_payload(edge.get("semantic_payload_json")),
                    "EDGE",
                    edge.get("edge_key") or "",
                )
                source_node_id = node_id_by_old_id.get(str(edge.get("source_node_id") or "")) or node_id_by_key.get(edge.get("source_node_key") or "")
                target_node_id = node_id_by_old_id.get(str(edge.get("target_node_id") or "")) or node_id_by_key.get(edge.get("target_node_key") or "")
                if edge["source_type"] == "NODE" and not source_node_id:
                    continue
                if edge["target_type"] == "NODE" and not target_node_id:
                    continue
                edge_semantic = bpmn_semantic_payload(
                    edge.get("bpmn_semantic_json"),
                    edge_semantic_type(edge),
                    edge.get("label"),
                )
                edge_label = semantic_display_name(edge_semantic, edge.get("label")) or None
                source_lane_id = lane_id_by_old_id.get(str(edge.get("source_lane_instance_id") or "")) or lane_id_by_key.get(edge.get("source_lane_instance_key") or "")
                target_lane_id = lane_id_by_old_id.get(str(edge.get("target_lane_instance_id") or "")) or lane_id_by_key.get(edge.get("target_lane_instance_key") or "")
                lane_id = lane_id_by_old_id.get(str(edge.get("lane_instance_id") or ""))
                cur.execute(
                    """
                    INSERT INTO business_flow_edge (
                        business_flow_id, lane_instance_id, edge_key, source_type,
                        source_node_id, source_lane_instance_id, source_port, target_type,
                        target_node_id, target_lane_instance_id, target_port, edge_type,
                        bpmn_flow_type, bpmn_sequence_flow_kind, bpmn_message_name,
                        bpmn_condition_expression, label, condition_text,
                        data_contract_json, origin_component_edge_key,
                        is_overridden, style_json, properties_json,
                        semantic_profile_key, semantic_profile_version, semantic_payload_json
                        , bpmn_semantic_json
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        business_flow_id,
                        lane_id,
                        edge["edge_key"],
                        edge["source_type"],
                        source_node_id,
                        source_lane_id,
                        edge.get("source_port"),
                        edge["target_type"],
                        target_node_id,
                        target_lane_id,
                        edge.get("target_port"),
                        edge.get("edge_type", "SEQUENCE"),
                        edge.get("bpmn_flow_type"),
                        edge.get("bpmn_sequence_flow_kind"),
                        edge.get("bpmn_message_name"),
                        edge.get("bpmn_condition_expression"),
                        edge_label,
                        edge.get("condition_text"),
                        Jsonb(edge.get("data_contract_json") or {}),
                        edge.get("origin_component_edge_key"),
                        bool(edge.get("is_overridden")),
                        Jsonb(edge.get("style_json") or {}),
                        Jsonb(strip_mes_json(edge.get("properties_json") or {})),
                        edge.get("semantic_profile_key"),
                        edge.get("semantic_profile_version"),
                        Jsonb(semantic_payload(edge.get("semantic_payload_json"))),
                        Jsonb(
                            edge_semantic
                        ),
                    ),
                )
            _normalize_business_flow_lane_bounds(cur, business_flow_id)
            base_version = int(flow["current_version"])
            new_version = base_version + 1
            cur.execute(
                """
                UPDATE business_flow
                SET current_version = %s, collab_revision = collab_revision + 1,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (new_version, business_flow_id),
            )
            cur.execute(
                """
                DELETE FROM collab_document
                WHERE owner_type = 'BUSINESS_FLOW' AND owner_id = %s
                """,
                (business_flow_id,),
            )
            _append_change_batch(
                cur,
                business_flow_id,
                base_version,
                new_version,
                "RESTORE",
                f"恢复到版本 {body.target_version}",
                [
                    {
                        "op_type": "RESTORE_SNAPSHOT",
                        "target_type": "CANVAS",
                        "target_key": str(business_flow_id),
                        "patch": {"targetVersion": body.target_version},
                        "inverse_patch": {"fromVersion": base_version},
                        "summary": f"恢复到版本 {body.target_version}",
                    }
                ],
                user.id,
            )
            _write_business_flow_snapshot(cur, business_flow_id, new_version, user.id)
            state = _fetch_business_flow_editor_state(cur, business_flow_id)
            return RestoreBusinessFlowResponse(
                new_version=new_version,
                restored_from_version=body.target_version,
                summary=f"已恢复到版本 {body.target_version}",
                editor_state=state,
            )


def _ensure_active_business_flow(cur, business_flow_id: UUID) -> None:
    cur.execute(
        """
        SELECT status
        FROM business_flow
        WHERE id = %s
        """,
        (business_flow_id,),
    )
    row = cur.fetchone()
    if not row or row["status"] == "ARCHIVED":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"business flow not found: {business_flow_id}",
        )


def _owner_count(cur, business_flow_id: UUID) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS n
        FROM business_flow_member
        WHERE business_flow_id = %s AND role = 'owner'
        """,
        (business_flow_id,),
    )
    return int(cur.fetchone()["n"])


def _member_response(row: dict) -> BusinessFlowMemberResponse:
    return BusinessFlowMemberResponse(
        user_id=row["user_id"],
        email=row["email"],
        display_name=row["display_name"],
        role=row["role"],
        created_at=row["created_at"],
        is_creator=bool(row.get("is_creator")),
    )


def _fetch_business_flow_member(
    cur,
    business_flow_id: UUID,
    user_id: UUID,
) -> BusinessFlowMemberResponse:
    cur.execute(
        """
        SELECT m.user_id, u.email, u.display_name, m.role, m.created_at,
               (bf.created_by = m.user_id::text) AS is_creator
        FROM business_flow_member m
        JOIN app_user u ON u.id = m.user_id
        JOIN business_flow bf ON bf.id = m.business_flow_id
        WHERE m.business_flow_id = %s AND m.user_id = %s
        """,
        (business_flow_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="business flow member not found",
        )
    return _member_response(row)


@router.get("/{business_flow_id}/members", response_model=list[BusinessFlowMemberResponse])
def list_business_flow_members(
    business_flow_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[BusinessFlowMemberResponse]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "owner")
            _ensure_active_business_flow(cur, business_flow_id)
            cur.execute(
                """
                SELECT m.user_id, u.email, u.display_name, m.role, m.created_at,
                       (bf.created_by = m.user_id::text) AS is_creator
                FROM business_flow_member m
                JOIN app_user u ON u.id = m.user_id
                JOIN business_flow bf ON bf.id = m.business_flow_id
                WHERE m.business_flow_id = %s
                ORDER BY m.created_at ASC, lower(u.email)
                """,
                (business_flow_id,),
            )
            return [_member_response(row) for row in cur.fetchall()]


@router.put("/{business_flow_id}/members", response_model=BusinessFlowMemberResponse)
def upsert_business_flow_member(
    business_flow_id: UUID,
    body: BusinessFlowMemberUpsertRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMemberResponse:
    email = body.email.strip().lower()
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "owner")
            _ensure_active_business_flow(cur, business_flow_id)
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
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="active user not found")
            target_user_id = target["id"]

            cur.execute(
                """
                SELECT created_by
                FROM business_flow
                WHERE id = %s AND status <> 'ARCHIVED'
                """,
                (business_flow_id,),
            )
            flow_row = cur.fetchone()
            if not flow_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"business flow not found: {business_flow_id}",
                )
            if flow_row["created_by"] == str(target_user_id) and body.role != "owner":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="business flow creator must remain owner",
                )

            cur.execute(
                """
                SELECT role
                FROM business_flow_member
                WHERE business_flow_id = %s AND user_id = %s
                """,
                (business_flow_id, target_user_id),
            )
            existing = cur.fetchone()
            if (
                existing
                and existing["role"] == "owner"
                and body.role != "owner"
                and _owner_count(cur, business_flow_id) <= 1
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot demote the last owner",
                )

            cur.execute(
                """
                INSERT INTO business_flow_member (business_flow_id, user_id, role)
                VALUES (%s, %s, %s)
                ON CONFLICT (business_flow_id, user_id)
                DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
                """,
                (business_flow_id, target_user_id, body.role),
            )
            return _fetch_business_flow_member(cur, business_flow_id, target_user_id)


@router.delete(
    "/{business_flow_id}/members/{member_user_id}",
    response_model=BusinessFlowMemberResponse,
)
def remove_business_flow_member(
    business_flow_id: UUID,
    member_user_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMemberResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "owner")
            _ensure_active_business_flow(cur, business_flow_id)
            member = _fetch_business_flow_member(cur, business_flow_id, member_user_id)
            if member.is_creator:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="business flow creator cannot be removed",
                )
            if member.role == "owner" and _owner_count(cur, business_flow_id) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot remove the last owner",
                )
            cur.execute(
                """
                DELETE FROM business_flow_member
                WHERE business_flow_id = %s AND user_id = %s
                """,
                (business_flow_id, member_user_id),
            )
            return member
