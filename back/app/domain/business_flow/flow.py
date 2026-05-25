"""业务流程聚合。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass(slots=True)
class ErBinding:
    binding_key: str
    step_key: str
    table_key: str | None = None
    column_key: str | None = None
    relation_key: str | None = None
    usage_type: str = "read"
    description: str | None = None

    def validate(self) -> None:
        if not self.table_key and not self.relation_key:
            raise ValueError("binding must reference a table or relation")


@dataclass(slots=True)
class BusinessFlow:
    graph_id: UUID
    flow_key: str
    name: str
    description: str | None = None
    nodes: list[dict[str, Any]] = field(default_factory=list)
    edges: list[dict[str, Any]] = field(default_factory=list)
    bindings: list[ErBinding] = field(default_factory=list)

    def validate(self) -> None:
        if not self.flow_key.strip():
            raise ValueError("flow_key is required")
        if not self.name.strip():
            raise ValueError("name is required")
        for binding in self.bindings:
            binding.validate()

    def to_flow_json(self) -> dict[str, Any]:
        return {"nodes": self.nodes, "edges": self.edges}
