from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class RestoreBusinessFlowVersionCommand:
    business_flow_id: UUID
    target_version: int
    restored_by: str | None = None
