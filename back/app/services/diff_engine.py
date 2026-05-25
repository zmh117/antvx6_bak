"""兼容：委托 domain 层 diff。"""

from __future__ import annotations

from typing import Any

from app.application.mappers import changes_to_dto, payload_from_dto
from app.domain.er.diff import changes_summary as _changes_summary
from app.domain.er.diff import compute_graph_diff as _compute_graph_diff
from app.domain.er.models import GraphState
from app.schemas.graph import GraphChangesPayload, NormalizedGraphPayload


def _state_from_dict(old_state: dict[str, Any]) -> GraphState:
    return GraphState(
        tables=old_state.get("tables") or {},
        columns=old_state.get("columns") or {},
        enums=old_state.get("enums") or {},
        relations=old_state.get("relations") or {},
        business_paths=old_state.get("business_paths") or {},
        x6_json=old_state.get("x6_json") or {"nodes": [], "edges": []},
        business_json=old_state.get("business_json") or [],
    )


def compute_graph_diff(
    old_state: dict[str, Any],
    payload: NormalizedGraphPayload,
) -> GraphChangesPayload:
    changes = _compute_graph_diff(_state_from_dict(old_state), payload_from_dto(payload))
    return changes_to_dto(changes)


def changes_summary(changes: GraphChangesPayload) -> dict[str, int]:
    from app.application.mappers import changes_from_dto

    return _changes_summary(changes_from_dto(changes))
