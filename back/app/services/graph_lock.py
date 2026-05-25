"""图记录加锁（基础设施辅助）。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg

from app.domain.shared.errors import VersionConflictError

__all__ = ["VersionConflictError", "lock_graph"]


def lock_graph(cur: psycopg.Cursor, graph_id: UUID) -> dict[str, Any]:
    cur.execute(
        "SELECT id, name, description, business_domain, version, status FROM er_graph WHERE id = %s FOR UPDATE",
        (graph_id,),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"graph not found: {graph_id}")
    return row
