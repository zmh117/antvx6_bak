from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class GetBusinessFlowHistoryQuery:
    business_flow_id: UUID
    limit: int = 50
