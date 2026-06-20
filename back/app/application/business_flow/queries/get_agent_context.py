from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import psycopg

from app.application.agent_context_service import agent_context_service


@dataclass(frozen=True, slots=True)
class GetAgentContextQuery:
    graph_id: UUID
    query: str | None = None


def handle_get_agent_context(
    cur: psycopg.Cursor, query: GetAgentContextQuery
) -> dict[str, Any]:
    """组装 Agent 写用例所需的图上下文（ER + 业务图）。"""
    return agent_context_service.build_agent_context(cur, query.graph_id, query.query)
