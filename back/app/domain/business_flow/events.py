"""Domain events reserved for Business Flow Context application services."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class SwimlaneComponentVersionPublished:
    component_id: UUID
    component_version_id: UUID
    version_no: int


@dataclass(frozen=True, slots=True)
class LaneInstanceCreated:
    business_flow_id: UUID
    lane_instance_id: UUID
    component_version_id: UUID


@dataclass(frozen=True, slots=True)
class BusinessFlowVersionChanged:
    business_flow_id: UUID
    base_version: int
    new_version: int
