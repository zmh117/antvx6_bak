"""Schema placeholders for reusable swimlane components and business flows."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class SwimlaneComponentListItemDTO(BaseModel):
    component_id: UUID
    component_version_id: UUID
    name: str
    category: str | None = None
    owner_role: str | None = None
    version_no: int
    thumbnail_url: str | None = None


class BusinessFlowLaneInstanceDTO(BaseModel):
    id: UUID
    instance_key: str
    component_id: UUID
    component_version_id: UUID
    display_name: str
    owner_role: str | None = None
    position_x: float = 0
    position_y: float = 0
    width: float = 240
    height: float = 600
    z_index: int = 0
    is_overridden: bool = False


class BusinessFlowNodeErRefDTO(BaseModel):
    id: UUID | None = None
    er_diagram_id: UUID
    er_table_key: str
    er_column_key: str | None = None
    ref_type: str = "READ"
    description: str | None = None


class BusinessFlowNodeDTO(BaseModel):
    id: UUID
    lane_instance_id: UUID | None = None
    node_key: str
    origin_component_node_key: str | None = None
    node_type: str
    title: str
    description: str | None = None
    actor: str | None = None
    business_rule: str | None = None
    input_summary: str | None = None
    output_summary: str | None = None
    position_x: float = 0
    position_y: float = 0
    width: float = 120
    height: float = 60
    is_overridden: bool = False
    er_refs: list[BusinessFlowNodeErRefDTO] = Field(default_factory=list)
    style_json: dict[str, Any] = Field(default_factory=dict)
    properties_json: dict[str, Any] = Field(default_factory=dict)


class BusinessFlowEdgeDTO(BaseModel):
    id: UUID
    lane_instance_id: UUID | None = None
    edge_key: str
    source_type: str
    source_node_id: UUID | None = None
    source_lane_instance_id: UUID | None = None
    source_port: str | None = None
    target_type: str
    target_node_id: UUID | None = None
    target_lane_instance_id: UUID | None = None
    target_port: str | None = None
    edge_type: str = "SEQUENCE"
    label: str | None = None
    condition_text: str | None = None
    data_contract_json: dict[str, Any] = Field(default_factory=dict)
    origin_component_edge_key: str | None = None
    is_overridden: bool = False
    style_json: dict[str, Any] = Field(default_factory=dict)
    properties_json: dict[str, Any] = Field(default_factory=dict)


class PlaceSwimlaneComponentPayload(BaseModel):
    component_version_id: UUID
    position: dict[str, float]


class BusinessFlowChangeOpPayload(BaseModel):
    op_type: str
    target_type: str
    target_key: str
    patch: dict[str, Any] = Field(default_factory=dict)
    inverse_patch: dict[str, Any] = Field(default_factory=dict)
    summary: str | None = None


class BusinessFlowEditorStateResponse(BaseModel):
    business_flow_id: UUID
    current_version: int
    lane_instances: list[BusinessFlowLaneInstanceDTO] = Field(default_factory=list)
    nodes: list[BusinessFlowNodeDTO] = Field(default_factory=list)
    edges: list[BusinessFlowEdgeDTO] = Field(default_factory=list)
