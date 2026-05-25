"""兼容：委托 infrastructure 加载图状态。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg

from app.infrastructure.db.graph_state_loader import graph_state_to_dict, load_graph_state as _load

__all__ = ["load_graph_state"]


def load_graph_state(cur: psycopg.Cursor, graph_id: UUID) -> dict[str, Any]:
    return graph_state_to_dict(_load(cur, graph_id))
