"""Agent retrieval index and validation helpers."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb


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
               relationship, join_condition, description, confidence, verified
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
                    f"基数 {r.get('relationship') or ''}",
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
                f"基数 {r.get('relationship') or ''}",
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
               relationship, join_condition, description, confidence, verified
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


def _merge_documents(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for doc in docs:
        key = doc.get("ref_relation_key") or doc.get("title") or ""
        dedupe = f"{doc.get('doc_type')}:{key}"
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

    sections: list[str] = []
    rel_lines: list[str] = []
    for doc in docs:
        sections.append(f"### {doc.get('title')}\n{doc.get('content')}")
        if doc.get("doc_type") == "relation" and doc.get("ref_relation_key"):
            rk = doc["ref_relation_key"]
            flag = " [verified]" if doc.get("verified") else " [unverified]"
            rel_lines.append(
                f"- {rk}: {doc.get('join_condition') or ''} "
                f"({doc.get('relationship')}, conf={doc.get('confidence')}){flag}"
            )

    text = "相关 Schema 摘要\n\n" + "\n\n".join(sections)
    if rel_lines:
        text += "\n\n逻辑关联：\n" + "\n".join(rel_lines)
    elif not q:
        cur.execute(
            """
            SELECT relation_key, join_condition, relationship, confidence, verified
            FROM er_relation WHERE graph_id = %s AND deleted_at IS NULL ORDER BY relation_key
            """,
            (graph_id,),
        )
        for r in cur.fetchall():
            flag = " [verified]" if r.get("verified") else " [unverified]"
            rel_lines.append(
                f"- {r['relation_key']}: {r.get('join_condition')} "
                f"({r.get('relationship')}, conf={r.get('confidence')}){flag}"
            )
        if rel_lines:
            text += "\n\n逻辑关联：\n" + "\n".join(rel_lines)

    return {
        "graph_id": str(graph_id),
        "version": g["version"],
        "text": text,
        "documents": docs,
    }
