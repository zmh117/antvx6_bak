"""Agent 上下文检索与业务图文档的数据访问层。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg

from app.services.agent_labels import match_operator_label, relation_type_label


def fetch_graph_version(cur: psycopg.Cursor, graph_id: UUID) -> int | None:
    cur.execute("SELECT version FROM er_graph WHERE id = %s", (graph_id,))
    row = cur.fetchone()
    return int(row["version"]) if row else None


def search_index_documents(
    cur: psycopg.Cursor,
    graph_id: UUID,
    *,
    query_pattern: str | None = None,
    limit: int,
) -> list[dict[str, Any]]:
    if query_pattern:
        cur.execute(
            """
            SELECT doc_type, title, content, ref_table_key, ref_column_key, ref_relation_key
            FROM er_search_document
            WHERE graph_id = %s
              AND (content ILIKE %s OR title ILIKE %s)
            ORDER BY doc_type, title
            LIMIT %s
            """,
            (graph_id, query_pattern, query_pattern, limit),
        )
    else:
        cur.execute(
            """
            SELECT doc_type, title, content, ref_table_key, ref_column_key, ref_relation_key
            FROM er_search_document
            WHERE graph_id = %s
            ORDER BY doc_type, title
            LIMIT %s
            """,
            (graph_id, limit),
        )
    return [dict(row) for row in cur.fetchall()]


def fetch_relations_for_column(
    cur: psycopg.Cursor, graph_id: UUID, table_key: str, column_key: str
) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT relation_key, source_table_key, source_column_key, target_table_key, target_column_key,
               relation_type, match_operator, relationship, join_condition, description, confidence, verified
        FROM er_relation
        WHERE graph_id = %s AND deleted_at IS NULL
          AND (
            (source_table_key = %s AND source_column_key = %s)
            OR (target_table_key = %s AND target_column_key = %s)
          )
        ORDER BY relation_key
        """,
        (graph_id, table_key, column_key, table_key, column_key),
    )
    return [relation_doc_from_row(dict(row)) for row in cur.fetchall()]


def fetch_relations_by_keys(
    cur: psycopg.Cursor, graph_id: UUID, relation_keys: list[str]
) -> list[dict[str, Any]]:
    if not relation_keys:
        return []
    cur.execute(
        """
        SELECT relation_key, source_table_key, source_column_key, target_table_key, target_column_key,
               relation_type, match_operator, relationship, join_condition, description, confidence, verified
        FROM er_relation
        WHERE graph_id = %s AND deleted_at IS NULL AND relation_key = ANY(%s)
        ORDER BY relation_key
        """,
        (graph_id, relation_keys),
    )
    return [relation_doc_from_row(dict(row)) for row in cur.fetchall()]


def fetch_all_relations_summary(cur: psycopg.Cursor, graph_id: UUID) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT relation_key, join_condition, relation_type, match_operator, relationship, confidence, verified
        FROM er_relation WHERE graph_id = %s AND deleted_at IS NULL ORDER BY relation_key
        """,
        (graph_id,),
    )
    return [dict(row) for row in cur.fetchall()]


def fetch_legacy_business_flow_rows(cur: psycopg.Cursor, graph_id: UUID) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT graph_id, flow_key, name, description, flow_json, version
        FROM er_business_flow
        WHERE graph_id = %s AND deleted_at IS NULL
        ORDER BY name
        """,
        (graph_id,),
    )
    return [dict(row) for row in cur.fetchall()]


def fetch_legacy_business_flow_bindings(
    cur: psycopg.Cursor, graph_id: UUID, flow_keys: list[str]
) -> dict[str, list[dict[str, Any]]]:
    if not flow_keys:
        return {}
    cur.execute(
        """
        SELECT flow_key, binding_key, step_key, table_key, column_key,
               relation_key, usage_type, description
        FROM er_business_flow_er_binding
        WHERE graph_id = %s AND deleted_at IS NULL AND flow_key = ANY(%s)
        ORDER BY flow_key, binding_key
        """,
        (graph_id, flow_keys),
    )
    bindings_by_flow: dict[str, list[dict[str, Any]]] = {}
    for row in cur.fetchall():
        bindings_by_flow.setdefault(row["flow_key"], []).append(dict(row))
    return bindings_by_flow


def fetch_swimlane_business_flow_rows(
    cur: psycopg.Cursor, graph_id: UUID
) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT bf.id, bf.code, bf.name, bf.description, bf.current_version, bf.product_id
        FROM business_flow bf
        JOIN er_graph g ON g.product_id = bf.product_id
        WHERE g.id = %s
          AND bf.deleted_at IS NULL
          AND bf.status <> 'ARCHIVED'
        ORDER BY bf.name
        """,
        (graph_id,),
    )
    return [dict(row) for row in cur.fetchall()]


def fetch_swimlane_flow_nodes(cur: psycopg.Cursor, business_flow_id: UUID) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT n.node_key, n.title, n.node_type, n.description, n.actor, n.business_rule,
               n.bpmn_element_type, n.bpmn_event_kind, n.bpmn_event_definition,
               n.bpmn_task_type, n.bpmn_gateway_type, n.bpmn_subprocess_kind,
               n.bpmn_call_activity_ref, n.bpmn_boundary_attached_to_node_key,
               n.input_summary, n.output_summary, n.mes_semantics_json,
               li.display_name AS lane_name
        FROM business_flow_node n
        LEFT JOIN business_flow_lane_instance li ON li.id = n.lane_instance_id
        WHERE n.business_flow_id = %s
        ORDER BY n.created_at ASC, n.node_key ASC
        """,
        (business_flow_id,),
    )
    return [dict(row) for row in cur.fetchall()]


def fetch_swimlane_flow_edges(cur: psycopg.Cursor, business_flow_id: UUID) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT edge_key, edge_type, label, condition_text, data_contract_json,
               bpmn_flow_type, bpmn_sequence_flow_kind, bpmn_message_name,
               bpmn_condition_expression, mes_semantics_json
        FROM business_flow_edge
        WHERE business_flow_id = %s
        ORDER BY created_at ASC, edge_key ASC
        """,
        (business_flow_id,),
    )
    return [dict(row) for row in cur.fetchall()]


def fetch_swimlane_flow_er_refs(cur: psycopg.Cursor, business_flow_id: UUID) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT r.id, n.node_key, r.er_diagram_id, r.er_table_key, r.er_column_key,
               r.ref_type, r.description
        FROM business_flow_node_er_ref r
        JOIN business_flow_node n ON n.id = r.business_flow_node_id
        WHERE r.business_flow_id = %s
        ORDER BY r.created_at ASC
        """,
        (business_flow_id,),
    )
    return [dict(row) for row in cur.fetchall()]


def relation_doc_from_row(row: dict[str, Any]) -> dict[str, Any]:
    title = row["relation_key"]
    content = "\n".join(
        filter(
            None,
            [
                f"逻辑关联 {row['source_table_key']}.{row['source_column_key']} -> {row['target_table_key']}.{row['target_column_key']}",
                f"业务关系 {relation_type_label(row.get('relation_type'))}",
                f"匹配方式 {match_operator_label(row.get('match_operator'))}",
                f"条件 {row.get('join_condition') or ''}",
                f"说明 {row.get('description') or ''}",
                f"置信度 {row.get('confidence')}",
                "已校验" if row.get("verified") else "未校验",
            ],
        )
    )
    return {
        "doc_type": "relation",
        "title": title,
        "content": content,
        "ref_table_key": None,
        "ref_column_key": None,
        "ref_relation_key": row["relation_key"],
        "join_condition": row.get("join_condition"),
        "relation_type": row.get("relation_type"),
        "match_operator": row.get("match_operator"),
        "relationship": row.get("relationship"),
        "confidence": row.get("confidence"),
        "verified": row.get("verified"),
    }
