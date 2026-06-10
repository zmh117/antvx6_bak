"""Value objects for the new Business Flow Context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.domain.business_flow.enums import ErRefType


@dataclass(frozen=True, slots=True)
class CanvasPosition:
    x: float = 0
    y: float = 0


@dataclass(frozen=True, slots=True)
class CanvasSize:
    width: float = 120
    height: float = 60


@dataclass(frozen=True, slots=True)
class Geometry:
    position: CanvasPosition
    size: CanvasSize
    z_index: int = 0


@dataclass(frozen=True, slots=True)
class ErReference:
    er_diagram_id: UUID
    er_table_key: str
    er_column_key: str | None = None
    ref_type: ErRefType = "READ"
    description: str | None = None


JsonDict = dict[str, Any]
