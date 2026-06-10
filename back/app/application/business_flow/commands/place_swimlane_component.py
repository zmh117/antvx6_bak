from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class CanvasPositionInput:
    x: float
    y: float


@dataclass(frozen=True, slots=True)
class PlaceSwimlaneComponentCommand:
    business_flow_id: UUID
    component_version_id: UUID
    position: CanvasPositionInput
    created_by: str | None = None
