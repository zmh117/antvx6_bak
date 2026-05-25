"""ER 图聚合根。"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.domain.er.diff import compute_canvas_graph_diff
from app.domain.er.merge import merge_incoming_with_state
from app.domain.er.models import GraphChanges, GraphPayload, GraphState
from app.domain.shared.errors import VersionConflictError


@dataclass(slots=True)
class ErGraph:
    graph_id: UUID
    version: int
    state: GraphState

    @classmethod
    def from_state(cls, graph_id: UUID, version: int, state: GraphState) -> ErGraph:
        return cls(graph_id=graph_id, version=version, state=state)

    def assert_base_version(self, expected: int | None) -> None:
        if expected is not None and expected != self.version:
            raise VersionConflictError(expected, self.version)

    def merge_incoming(self, incoming: GraphPayload) -> GraphPayload:
        return merge_incoming_with_state(incoming, self.state)

    def plan_changes(self, merged: GraphPayload) -> GraphChanges:
        return compute_canvas_graph_diff(self.state, merged)
