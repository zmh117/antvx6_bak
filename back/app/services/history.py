"""Change log query and human-readable summaries."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg

from app.schemas.graph import ChangeLogEntry, HistoryResponse

_OPERATION_SOURCE_LABELS = {
    "undo": "撤销",
    "redo": "重做",
    "auto_save": "自动保存",
    "manual_save": "手动保存",
    "restore": "恢复",
    "collab_auto_save": "协同物化",
    "collab_restore": "协同恢复",
}


def _checkpoint_source_label(after: dict[str, Any]) -> str:
    source = after.get("operation_source") or "auto_save"
    return _OPERATION_SOURCE_LABELS.get(str(source), str(source))


def _format_summary(row: dict[str, Any]) -> str:
    ct = row["change_type"]
    et = row["entity_type"]
    key = row["entity_key"]
    if ct == "checkpoint":
        after = row.get("after_data") or {}
        summary = after.get("summary") or {}
        parts = []
        for k, v in summary.items():
            if v:
                parts.append(f"{k}={v}")
        detail = ", ".join(parts) if parts else "无变更"
        source_label = _checkpoint_source_label(after)
        return f"{source_label}保存 v{row.get('graph_version') or '?'} ({detail})"
    if ct == "delete":
        if et == "relation":
            return f"删除连线 {key}"
        if et == "column":
            return f"删除字段 {key.replace('::', '.')}"
        if et == "table":
            return f"删除表 {key}"
        if et == "enum":
            return f"删除枚举 {key}"
        return f"删除 {et} {key}"
    if ct == "upsert":
        if et == "business_flow":
            after = row.get("after_data") or {}
            return f"更新业务图 {after.get('name') or key}"
        if et == "relation":
            after = row.get("after_data") or {}
            return (
                f"连线 {after.get('source_table_key')}.{after.get('source_column_key')}"
                f" → {after.get('target_table_key')}.{after.get('target_column_key')}"
            )
        if et == "column":
            return f"更新字段 {key.replace('::', '.')}"
        if et == "table":
            return f"更新表 {key}"
        if et == "enum":
            return f"更新枚举 {key}"
        return f"更新 {et} {key}"
    if ct == "create" and et == "business_flow":
        after = row.get("after_data") or {}
        return f"创建业务图 {after.get('name') or key}"
    return f"{ct} {et} {key}"


def list_change_history(
    cur: psycopg.Cursor,
    graph_id: UUID,
    *,
    limit: int = 100,
) -> HistoryResponse:
    cur.execute("SELECT version FROM er_graph WHERE id = %s", (graph_id,))
    g = cur.fetchone()
    if not g:
        raise ValueError("graph not found")

    cur.execute(
        """
        SELECT id, graph_id, change_type, entity_type, entity_key,
               before_data, after_data, client_id, user_id, graph_version, created_at
        FROM er_change_log
        WHERE graph_id = %s
        ORDER BY id DESC
        LIMIT %s
        """,
        (graph_id, limit),
    )
    entries: list[ChangeLogEntry] = []
    for r in cur.fetchall():
        created = r["created_at"]
        entries.append(
            ChangeLogEntry(
                id=r["id"],
                graph_id=r["graph_id"],
                change_type=r["change_type"],
                entity_type=r["entity_type"],
                entity_key=r["entity_key"],
                summary=_format_summary(dict(r)),
                before_data=r.get("before_data"),
                after_data=r.get("after_data"),
                client_id=r.get("client_id"),
                user_id=r.get("user_id"),
                graph_version=r.get("graph_version"),
                created_at=created.isoformat() if hasattr(created, "isoformat") else str(created),
            )
        )
    return HistoryResponse(graph_id=graph_id, version=g["version"], entries=entries)
