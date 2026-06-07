"""Agent retrieval index and validation helpers."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

RELATION_TYPE_LABELS = {
    "identifier_match": "标识匹配",
    "ownership": "归属关系",
    "lookup": "码值/维表映射",
    "same_meaning": "同义字段",
    "hierarchy": "层级关系",
    "derived": "派生关系",
    "business_process": "业务流程关联",
    "semantic_related": "语义相关",
    "logical_relation": "逻辑关系",
    "foreign_key": "外键关系",
    "business_relation": "业务关系",
    "lookup_relation": "查询关系",
    "derived_relation": "派生关系",
    "unknown": "未知",
}

MATCH_OPERATOR_LABELS = {
    "eq": "等于",
    "contains": "包含",
    "included_in": "被包含",
    "prefix_match": "前缀匹配",
    "pattern_match": "模式匹配",
    "range_match": "区间匹配",
    "mapping": "映射转换",
    "semantic_match": "语义适配",
}


def _relation_type_label(value: str | None) -> str:
    return RELATION_TYPE_LABELS.get(value or "", value or "标识匹配")


def _match_operator_label(value: str | None) -> str:
    return MATCH_OPERATOR_LABELS.get(value or "", value or "等于")


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
        cur.execute(
            """
            INSERT INTO er_search_document (graph_id, doc_key, doc_type, ref_table_key, title, content, tags)
            VALUES (%s, %s, 'table', %s, %s, %s, %s)
            """,
            (graph_id, f"table:{t['table_key']}", t["table_key"], title, content, t.get("tags") or []),
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
        cur.execute(
            """
            INSERT INTO er_search_document (graph_id, doc_key, doc_type, ref_table_key, ref_column_key, title, content)
            VALUES (%s, %s, 'column', %s, %s, %s, %s)
            """,
            (graph_id, f"column:{title}", c["table_key"], c["column_key"], title, content),
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
        cur.execute(
            """
            INSERT INTO er_search_document (graph_id, doc_key, doc_type, ref_table_key, ref_column_key, title, content)
            VALUES (%s, %s, 'enum', %s, %s, %s, %s)
            """,
            (graph_id, doc_key, e["table_key"], e["column_key"], doc_key, content),
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
                    f"业务关系 {_relation_type_label(r.get('relation_type'))}",
                    f"匹配方式 {_match_operator_label(r.get('match_operator'))}",
                    f"条件 {r.get('join_condition') or ''}",
                    f"说明 {r.get('description') or ''}",
                    f"置信度 {r.get('confidence')}",
                    "已校验" if r.get("verified") else "未校验",
                ],
            )
        )
        cur.execute(
            """
            INSERT INTO er_search_document (graph_id, doc_key, doc_type, ref_relation_key, title, content)
            VALUES (%s, %s, 'relation', %s, %s, %s)
            """,
            (graph_id, f"relation:{title}", r["relation_key"], title, content),
        )


def _normalize_agent_query(query: str | None) -> str | None:
    if not query:
        return None
    q = query.strip()
    if len(q) >= 2 and q[0] == q[-1] and q[0] in "'\"":
        q = q[1:-1].strip()
    return q or None


def _relation_doc_from_row(r: dict[str, Any]) -> dict[str, Any]:
    title = r["relation_key"]
    content = "\n".join(
        filter(
            None,
            [
                f"逻辑关联 {r['source_table_key']}.{r['source_column_key']} -> {r['target_table_key']}.{r['target_column_key']}",
                f"业务关系 {_relation_type_label(r.get('relation_type'))}",
                f"匹配方式 {_match_operator_label(r.get('match_operator'))}",
                f"条件 {r.get('join_condition') or ''}",
                f"说明 {r.get('description') or ''}",
                f"置信度 {r.get('confidence')}",
                "已校验" if r.get("verified") else "未校验",
            ],
        )
    )
    return {
        "doc_type": "relation",
        "title": title,
        "content": content,
        "ref_table_key": None,
        "ref_column_key": None,
        "ref_relation_key": r["relation_key"],
        "join_condition": r.get("join_condition"),
        "relation_type": r.get("relation_type"),
        "match_operator": r.get("match_operator"),
        "relationship": r.get("relationship"),
        "confidence": r.get("confidence"),
        "verified": r.get("verified"),
    }


def _fetch_relations_for_column(
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
    return [_relation_doc_from_row(dict(r)) for r in cur.fetchall()]


def _fetch_relations_by_keys(
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
    return [_relation_doc_from_row(dict(r)) for r in cur.fetchall()]


def _enrich_relation_documents(
    cur: psycopg.Cursor, graph_id: UUID, docs: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    relation_keys = [
        str(doc["ref_relation_key"])
        for doc in docs
        if doc.get("doc_type") == "relation" and doc.get("ref_relation_key")
    ]
    full_docs = {
        doc["ref_relation_key"]: doc
        for doc in _fetch_relations_by_keys(cur, graph_id, relation_keys)
    }
    return [
        full_docs.get(doc.get("ref_relation_key"), doc)
        if doc.get("doc_type") == "relation"
        else doc
        for doc in docs
    ]


def _node_label(node: dict[str, Any]) -> str:
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    for key in ("label", "name", "title"):
        value = data.get(key) or node.get(key)
        if value:
            return str(value)
    return str(node.get("id") or node.get("key") or "未命名步骤")


def _flow_doc_from_row(row: dict[str, Any]) -> dict[str, Any]:
    flow_json = row.get("flow_json") or {}
    nodes = flow_json.get("nodes") or []
    edges = flow_json.get("edges") or []
    step_lines = [
        f"- {node.get('id') or node.get('key')}: {_node_label(node)}"
        for node in nodes
        if isinstance(node, dict)
    ]
    content = "\n".join(
        filter(
            None,
            [
                f"业务流程 {row['flow_key']}：{row['name']}",
                f"说明：{row.get('description') or ''}",
                f"步骤数：{len(nodes)}，连线数：{len(edges)}",
                "步骤：\n" + "\n".join(step_lines) if step_lines else "",
            ],
        )
    )
    return {
        "doc_type": "business_flow",
        "title": row["name"],
        "content": content,
        "ref_flow_key": row["flow_key"],
        "ref_table_key": None,
        "ref_column_key": None,
        "ref_relation_key": None,
    }


def _binding_doc_from_row(flow: dict[str, Any], binding: dict[str, Any]) -> dict[str, Any]:
    target = binding.get("relation_key")
    if not target and binding.get("table_key"):
        target = binding["table_key"]
        if binding.get("column_key"):
            target = f"{target}.{binding['column_key']}"
    content = "\n".join(
        filter(
            None,
            [
                f"流程绑定 {flow['name']} / {binding['step_key']}",
                f"用途：{binding.get('usage_type') or 'read'}",
                f"目标：{target or ''}",
                f"说明：{binding.get('description') or ''}",
            ],
        )
    )
    return {
        "doc_type": "business_flow_binding",
        "title": f"{flow['name']}:{binding['step_key']}",
        "content": content,
        "ref_flow_key": flow["flow_key"],
        "ref_step_key": binding["step_key"],
        "ref_table_key": binding.get("table_key"),
        "ref_column_key": binding.get("column_key"),
        "ref_relation_key": binding.get("relation_key"),
        "usage_type": binding.get("usage_type") or "read",
    }


def _fetch_business_flow_documents(
    cur: psycopg.Cursor,
    graph_id: UUID,
    query: str | None,
    er_docs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT graph_id, flow_key, name, description, flow_json, version
        FROM er_business_flow
        WHERE graph_id = %s AND deleted_at IS NULL
        ORDER BY name
        """,
        (graph_id,),
    )
    flows = [dict(r) for r in cur.fetchall()]
    if not flows:
        return []

    flow_keys = [f["flow_key"] for f in flows]
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

    related_tables = {doc.get("ref_table_key") for doc in er_docs if doc.get("ref_table_key")}
    related_columns = {
        (doc.get("ref_table_key"), doc.get("ref_column_key"))
        for doc in er_docs
        if doc.get("ref_table_key") and doc.get("ref_column_key")
    }
    related_relations = {
        doc.get("ref_relation_key") for doc in er_docs if doc.get("ref_relation_key")
    }
    q = query.casefold() if query else None

    docs: list[dict[str, Any]] = []
    for flow in flows:
        bindings = bindings_by_flow.get(flow["flow_key"], [])
        searchable = json.dumps(
            {
                "flow_key": flow["flow_key"],
                "name": flow["name"],
                "description": flow.get("description"),
                "flow_json": flow.get("flow_json") or {},
                "bindings": bindings,
            },
            ensure_ascii=False,
            default=str,
        ).casefold()
        matched_by_query = bool(q and q in searchable)
        matched_by_ref = any(
            b.get("relation_key") in related_relations
            or b.get("table_key") in related_tables
            or (b.get("table_key"), b.get("column_key")) in related_columns
            for b in bindings
        )
        if query and not matched_by_query and not matched_by_ref:
            continue

        docs.append(_flow_doc_from_row(flow))
        docs.extend(_binding_doc_from_row(flow, binding) for binding in bindings)

    return docs


def _merge_documents(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for doc in docs:
        doc_type = doc.get("doc_type")
        if doc_type == "business_flow_binding":
            key = f"{doc.get('ref_flow_key')}:{doc.get('ref_step_key')}:{doc.get('title')}"
        elif doc_type == "business_flow":
            key = doc.get("ref_flow_key") or doc.get("title") or ""
        elif doc.get("ref_relation_key"):
            key = doc["ref_relation_key"]
        elif doc.get("ref_table_key") and doc.get("ref_column_key"):
            key = f"{doc['ref_table_key']}.{doc['ref_column_key']}"
        else:
            key = doc.get("title") or ""
        dedupe = f"{doc_type}:{key}"
        if dedupe in seen:
            continue
        seen.add(dedupe)
        merged.append(doc)
    return merged


def build_agent_context(cur: psycopg.Cursor, graph_id: UUID, query: str | None = None) -> dict[str, Any]:
    cur.execute("SELECT version FROM er_graph WHERE id = %s", (graph_id,))
    g = cur.fetchone()
    if not g:
        raise ValueError("graph not found")

    q = _normalize_agent_query(query)
    docs: list[dict[str, Any]] = []

    if q:
        pattern = f"%{q}%"
        cur.execute(
            """
            SELECT doc_type, title, content, ref_table_key, ref_column_key, ref_relation_key
            FROM er_search_document
            WHERE graph_id = %s
              AND (content ILIKE %s OR title ILIKE %s)
            ORDER BY doc_type, title
            LIMIT 80
            """,
            (graph_id, pattern, pattern),
        )
        docs = [dict(r) for r in cur.fetchall()]

        expanded: list[dict[str, Any]] = []
        for doc in docs:
            if doc.get("doc_type") != "column":
                continue
            table_key = doc.get("ref_table_key")
            column_key = doc.get("ref_column_key")
            if table_key and column_key:
                expanded.extend(_fetch_relations_for_column(cur, graph_id, table_key, column_key))
        docs = _merge_documents(docs + expanded)
    else:
        cur.execute(
            """
            SELECT doc_type, title, content, ref_table_key, ref_column_key, ref_relation_key
            FROM er_search_document
            WHERE graph_id = %s
            ORDER BY doc_type, title
            LIMIT 120
            """,
            (graph_id,),
        )
        docs = [dict(r) for r in cur.fetchall()]

    docs = _enrich_relation_documents(cur, graph_id, docs)
    docs = _merge_documents(docs + _fetch_business_flow_documents(cur, graph_id, q, docs))

    sections: list[str] = []
    rel_lines: list[str] = []
    flow_lines: list[str] = []
    for doc in docs:
        sections.append(f"### {doc.get('title')}\n{doc.get('content')}")
        if doc.get("doc_type") == "relation" and doc.get("ref_relation_key"):
            rk = doc["ref_relation_key"]
            flag = " [verified]" if doc.get("verified") else " [unverified]"
            rel_lines.append(
                f"- {rk}: {doc.get('join_condition') or ''} "
                f"({_match_operator_label(doc.get('match_operator'))}, conf={doc.get('confidence')}){flag}"
            )
        if doc.get("doc_type") == "business_flow_binding" and doc.get("ref_flow_key"):
            target = doc.get("ref_relation_key")
            if not target and doc.get("ref_table_key"):
                target = doc["ref_table_key"]
                if doc.get("ref_column_key"):
                    target = f"{target}.{doc['ref_column_key']}"
            flow_lines.append(
                f"- {doc['ref_flow_key']}/{doc.get('ref_step_key')}: "
                f"{doc.get('usage_type') or 'read'} {target or ''}"
            )

    text = "相关 Schema 摘要\n\n" + "\n\n".join(sections)
    if rel_lines:
        text += "\n\n逻辑关联：\n" + "\n".join(rel_lines)
    elif not q:
        cur.execute(
            """
            SELECT relation_key, join_condition, relation_type, match_operator, relationship, confidence, verified
            FROM er_relation WHERE graph_id = %s AND deleted_at IS NULL ORDER BY relation_key
            """,
            (graph_id,),
        )
        for r in cur.fetchall():
            flag = " [verified]" if r.get("verified") else " [unverified]"
            rel_lines.append(
                f"- {r['relation_key']}: {r.get('join_condition')} "
                f"({_match_operator_label(r.get('match_operator'))}, conf={r.get('confidence')}){flag}"
            )
        if rel_lines:
            text += "\n\n逻辑关联：\n" + "\n".join(rel_lines)
    if flow_lines:
        text += "\n\n业务流程绑定：\n" + "\n".join(flow_lines)

    return {
        "graph_id": str(graph_id),
        "version": g["version"],
        "text": text,
        "documents": docs,
    }
