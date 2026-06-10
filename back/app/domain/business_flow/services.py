"""Domain service placeholders for Business Flow Context."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from app.domain.business_flow.entities import BusinessFlowEdge, BusinessFlowNode, LaneInstance


@dataclass(slots=True)
class SwimlaneInstantiation:
    lane_instance: LaneInstance
    nodes: list[BusinessFlowNode] = field(default_factory=list)
    edges: list[BusinessFlowEdge] = field(default_factory=list)


def ensure_lane_instance_keeps_source_version(
    component_id: UUID,
    component_version_id: UUID,
) -> tuple[UUID, UUID]:
    """Document the invariant that instances always store component and version."""
    return component_id, component_version_id
