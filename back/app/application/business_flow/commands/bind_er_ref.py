from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class BindErRefCommand:
    business_flow_id: UUID
    business_flow_node_id: UUID
    er_diagram_id: UUID
    er_table_key: str
    er_column_key: str | None = None
    ref_type: str = "READ"
    description: str | None = None
    created_by: str | None = None
