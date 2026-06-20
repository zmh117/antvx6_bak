"""Agent retrieval index and validation helpers.

历史检索/校验入口，现已收敛到 DDD：
- 上下文组装委托给 ``app.application.agent_context_service``。
- 业务图文档（legacy 与泳道）统一写入 ``er_search_document``，与 ER 检索层一致。
本模块仅保留检索索引重建、校验，以及向后兼容的薄封装。
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg

from app.application.agent_context_service import (
    agent_context_service,
    fetch_business_flow_documents,
    legacy_binding_doc_from_row,
    legacy_flow_doc_from_row,
    swimlane_binding_doc_from_row,
    swimlane_flow_doc_from_row,
)
from app.infrastructure.db.repositories import agent_context_repository as repo
from app.services.agent_labels import match_operator_label, relation_type_label


def run_validation(cur: psycopg.Cursor, graph_id: UUID) -> list[str]:
    warnings: list[str] = []
    cur.execute("DELETE FROM er_validation_issue WHERE graph_id = %s AND resolved = FALSE", (graph_id,))

    cur.execute(
        """
        SELECT relation_key, source_table_key, source_column_key, target_table_key, target_column_key,
               c1.column_role AS src_role, c1.data_type AS src_type,
               c2.column_role AS tgt_role, c2.data_type AS tgt_type
        FROM er_relation r
        LEFT JOIN er_column c1 ON c1.graph_id = r.graph_id
            AND c1.table_key = r.source_table_key AND c1.column_key = r.source_column_key AND c1.deleted_at IS NULL
        LEFT JOIN er_column c2 ON c2.graph_id = r.graph_id
            AND c2.table_key = r.target_table_key AND c2.column_key = r.target_column_key AND c2.deleted_at IS NULL
        WHERE r.graph_id = %s AND r.deleted_at IS NULL
        """,
        (graph_id,),
    )
    for row in cur.fetchall():
        src_role = row.get("src_role") or ""
        tgt_role = row.get("tgt_role") or ""
        if src_role == "status" and tgt_role == "time":
            msg = (
                f"{row['relation_key']}: status field linked to time field "
                f"({row['source_table_key']}.{row['source_column_key']} -> "
                f"{row['target_table_key']}.{row['target_column_key']}), may be invalid"
            )
            warnings.append(msg)
            cur.execute(
                """
                INSERT INTO er_validation_issue (graph_id, issue_type, severity, ref_type, ref_key, message, suggestion)
                VALUES (%s, 'type_mismatch_relation', 'warning', 'relation', %s, %s, %s)
                """,
                (graph_id, row["relation_key"], msg, "Review join semantics and verify relation"),
            )
    return warnings


def _insert_search_document(
    cur: psycopg.Cursor,
    graph_id: UUID,
    *,
    doc_key: str,
    doc_type: str,
    title: str,
    content: str,
    ref_table_key: str | None = None,
    ref_column_key: str | None = None,
    ref_relation_key: str | None = None,
    tags: list[str] | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO er_search_document (
            graph_id, doc_key, doc_type, ref_table_key, ref_column_key,
            ref_relation_key, title, content, tags
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            graph_id,
            doc_key,
            doc_type,
            ref_table_key,
            ref_column_key,
            ref_relation_key,
            title,
            content,
            tags or [],
        ),
    )


def _index_business_flow_documents(cur: psycopg.Cursor, graph_id: UUID) -> None:
    """把业务图（legacy er_business_flow 与泳道 business_flow）写入检索文档层。"""
    legacy_flows = repo.fetch_legacy_business_flow_rows(cur, graph_id)
    legacy_bindings = repo.fetch_legacy_business_flow_bindings(
        cur, graph_id, [flow["flow_key"] for flow in legacy_flows]
    )
    for flow in legacy_flows:
        doc = legacy_flow_doc_from_row(flow)
        _insert_search_document(
            cur,
            graph_id,
            doc_key=f"business_flow:{flow['flow_key']}",
            doc_type="business_flow",
            title=doc["title"],
            content=doc["content"],
        )
        for binding in legacy_bindings.get(flow["flow_key"], []):
            binding_doc = legacy_binding_doc_from_row(flow, binding)
            _insert_search_document(
                cur,
                graph_id,
                doc_key=f"business_flow_binding:{flow['flow_key']}:{binding['step_key']}",
                doc_type="business_flow_binding",
                title=binding_doc["title"],
                content=binding_doc["content"],
                ref_table_key=binding_doc.get("ref_table_key"),
                ref_column_key=binding_doc.get("ref_column_key"),
                ref_relation_key=binding_doc.get("ref_relation_key"),
            )

    for flow in repo.fetch_swimlane_business_flow_rows(cur, graph_id):
        doc = swimlane_flow_doc_from_row(cur, flow)
        _insert_search_document(
            cur,
            graph_id,
            doc_key=f"swimlane_business_flow:{flow['id']}",
            doc_type="business_flow",
            title=doc["title"],
            content=doc["content"],
        )
        for ref in repo.fetch_swimlane_flow_er_refs(cur, flow["id"]):
            binding_doc = swimlane_binding_doc_from_row(flow, ref)
            _insert_search_document(
                cur,
                graph_id,
                doc_key=f"swimlane_business_flow_binding:{flow['id']}:{ref['node_key']}:{ref['id']}",
                doc_type="business_flow_binding",
                title=binding_doc["title"],
                content=binding_doc["content"],
                ref_table_key=binding_doc.get("ref_table_key"),
                ref_column_key=binding_doc.get("ref_column_key"),
            )


def rebuild_search_documents(cur: psycopg.Cursor, graph_id: UUID) -> None:
    cur.execute("DELETE FROM er_search_document WHERE graph_id = %s", (graph_id,))

    cur.execute(
        "SELECT table_key, table_name, business_name, description, tags FROM er_table WHERE graph_id = %s AND deleted_at IS NULL",
        (graph_id,),
    )
    for t in cur.fetchall():
        title = t.get("business_name") or t["table_name"]
        content = "\n".join(
            filter(
                None,
                [
                    f"表 {t['table_key']}（{t['table_name']}）",
                    f"业务名：{t.get('business_name') or ''}",
                    f"说明：{t.get('description') or ''}",
                    f"标签：{', '.join(t.get('tags') or [])}",
                ],
            )
        )
        _insert_search_document(
            cur,
            graph_id,
            doc_key=f"table:{t['table_key']}",
            doc_type="table",
            title=title,
            content=content,
            ref_table_key=t["table_key"],
            tags=t.get("tags") or [],
        )

    cur.execute(
        """
        SELECT table_key, column_key, column_name, data_type, business_name, description, comment, column_role
        FROM er_column WHERE graph_id = %s AND deleted_at IS NULL
        """,
        (graph_id,),
    )
    for c in cur.fetchall():
        title = f"{c['table_key']}.{c['column_key']}"
        cur.execute(
            """
            SELECT relation_key, join_condition
            FROM er_relation
            WHERE graph_id = %s AND deleted_at IS NULL
              AND (
                (source_table_key = %s AND source_column_key = %s)
                OR (target_table_key = %s AND target_column_key = %s)
              )
            ORDER BY relation_key
            """,
            (graph_id, c["table_key"], c["column_key"], c["table_key"], c["column_key"]),
        )
        rel_hints = [
            f"查询关联 {row['relation_key']}: {row.get('join_condition') or ''}"
            for row in cur.fetchall()
        ]
        content = "\n".join(
            filter(
                None,
                [
                    f"字段 {title}",
                    f"类型 {c.get('data_type') or ''}",
                    f"角色 {c.get('column_role') or ''}",
                    f"注释 {c.get('comment') or ''}",
                    f"说明 {c.get('description') or ''}",
                    *rel_hints,
                ],
            )
        )
        _insert_search_document(
            cur,
            graph_id,
            doc_key=f"column:{title}",
            doc_type="column",
            title=title,
            content=content,
            ref_table_key=c["table_key"],
            ref_column_key=c["column_key"],
        )

    cur.execute(
        """
        SELECT table_key, column_key, value, label, description
        FROM er_column_enum_value WHERE graph_id = %s AND deleted_at IS NULL AND enabled = TRUE
        ORDER BY table_key, column_key, sort_order
        """,
        (graph_id,),
    )
    for e in cur.fetchall():
        doc_key = f"enum:{e['table_key']}.{e['column_key']}:{e['value']}"
        content = f"{e['value']} = {e['label']}" + (f"（{e['description']}）" if e.get("description") else "")
        _insert_search_document(
            cur,
            graph_id,
            doc_key=doc_key,
            doc_type="enum",
            title=doc_key,
            content=content,
            ref_table_key=e["table_key"],
            ref_column_key=e["column_key"],
        )

    cur.execute(
        """
        SELECT relation_key, source_table_key, source_column_key, target_table_key, target_column_key,
               relation_type, match_operator, relationship, join_condition, description, confidence, verified
        FROM er_relation WHERE graph_id = %s AND deleted_at IS NULL
        """,
        (graph_id,),
    )
    for r in cur.fetchall():
        title = r["relation_key"]
        content = "\n".join(
            filter(
                None,
                [
                    f"逻辑关联 {r['source_table_key']}.{r['source_column_key']} -> {r['target_table_key']}.{r['target_column_key']}",
                    f"业务关系 {relation_type_label(r.get('relation_type'))}",
                    f"匹配方式 {match_operator_label(r.get('match_operator'))}",
                    f"条件 {r.get('join_condition') or ''}",
                    f"说明 {r.get('description') or ''}",
                    f"置信度 {r.get('confidence')}",
                    "已校验" if r.get("verified") else "未校验",
                ],
            )
        )
        _insert_search_document(
            cur,
            graph_id,
            doc_key=f"relation:{title}",
            doc_type="relation",
            title=title,
            content=content,
            ref_relation_key=r["relation_key"],
        )

    _index_business_flow_documents(cur, graph_id)


def build_agent_context(cur: psycopg.Cursor, graph_id: UUID, query: str | None = None) -> dict[str, Any]:
    """向后兼容入口，委托给 DDD 应用服务。"""
    return agent_context_service.build_agent_context(cur, graph_id, query)


# 兼容旧引用：业务图文档组装
_fetch_business_flow_documents = fetch_business_flow_documents
