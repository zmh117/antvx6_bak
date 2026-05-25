"""画布节点识别（纯函数，不依赖 HTTP 或 DB）。"""

from __future__ import annotations

from typing import Any


def is_valid_table_key(table_key: str) -> bool:
    """关系键形如 ``posts.status__users.id``，不是表键。"""
    return bool(table_key) and "__" not in table_key


def is_table_cell(cell: dict[str, Any]) -> bool:
    if cell.get("source") or cell.get("target"):
        return False
    if cell.get("shape") == "er-table":
        return True
    data = cell.get("data") or {}
    return isinstance(data.get("fields"), list)


def table_id_from_node(node: dict[str, Any]) -> str | None:
    tid = str(node.get("id") or "")
    if not tid:
        data = node.get("data") or {}
        tid = str(data.get("id") or "")
    if not is_valid_table_key(tid):
        return None
    return tid


def canvas_node_table_ids(snapshot_nodes: list[dict[str, Any]] | None) -> set[str]:
    ids: set[str] = set()
    for node in snapshot_nodes or []:
        if not is_table_cell(node):
            continue
        tid = table_id_from_node(node)
        if tid:
            ids.add(tid)
    return ids
