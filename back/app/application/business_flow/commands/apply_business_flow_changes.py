from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass(frozen=True, slots=True)
class BusinessFlowChangeOpInput:
    op_type: str
    target_type: str
    target_key: str
    patch: dict[str, Any] = field(default_factory=dict)
    inverse_patch: dict[str, Any] = field(default_factory=dict)
    summary: str | None = None


@dataclass(frozen=True, slots=True)
class ApplyBusinessFlowChangesCommand:
    business_flow_id: UUID
    base_version: int
    ops: list[BusinessFlowChangeOpInput] = field(default_factory=list)
    source: str = "USER"
    summary: str | None = None
    created_by: str | None = None
