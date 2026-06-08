"""业务流程聚合。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

ALLOWED_NODE_TYPES = {
    "lane",
    "start_event",
    "end_event",
    "activity",
    "subprocess",
    "exclusive_gateway",
    "parallel_gateway",
}

BINDABLE_NODE_TYPES = {"activity", "subprocess"}


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
        if not self.binding_key.strip():
            raise ValueError("binding_key is required")
        if not self.step_key.strip():
            raise ValueError("binding step_key is required")
        if self.column_key and not self.table_key:
            raise ValueError("column binding must include table_key")
        if self.relation_key and (self.table_key or self.column_key):
            raise ValueError("binding must reference either relation or table/column")
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
        node_ids: set[str] = set()
        bindable_ids: set[str] = set()
        for node in self.nodes:
            node_id = str(node.get("id") or "").strip()
            node_type = str(node.get("type") or "").strip()
            if not node_id:
                raise ValueError("business flow node id is required")
            if node_id in node_ids:
                raise ValueError(f"duplicate business flow node id: {node_id}")
            if node_type not in ALLOWED_NODE_TYPES:
                raise ValueError(f"unsupported business flow node type: {node_type}")
            position = node.get("position")
            size = node.get("size")
            if not isinstance(position, dict) or not isinstance(size, dict):
                raise ValueError(f"business flow node {node_id} must include position and size")
            node_ids.add(node_id)
            if node_type in BINDABLE_NODE_TYPES:
                bindable_ids.add(node_id)
        edge_ids: set[str] = set()
        for edge in self.edges:
            edge_id = str(edge.get("id") or "").strip()
            source = str(edge.get("source") or "").strip()
            target = str(edge.get("target") or "").strip()
            if not edge_id:
                raise ValueError("business flow edge id is required")
            if edge_id in edge_ids:
                raise ValueError(f"duplicate business flow edge id: {edge_id}")
            if source not in node_ids or target not in node_ids:
                raise ValueError(f"business flow edge endpoint not found: {edge_id}")
            edge_ids.add(edge_id)
        for binding in self.bindings:
            binding.validate()
            if binding.step_key not in bindable_ids:
                raise ValueError(
                    f"binding step_key must reference activity or subprocess: {binding.step_key}"
                )

    def to_flow_json(self) -> dict[str, Any]:
        return {"nodes": self.nodes, "edges": self.edges}
