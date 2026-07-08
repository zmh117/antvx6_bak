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


class BusinessFlowNodeErRefDTO(BaseModel):
    id: UUID | None = None
    er_diagram_id: UUID
    er_table_key: str
    er_column_key: str | None = None
    ref_type: str = "READ"
    description: str | None = None


class SwimlaneComponentNodeDTO(BaseModel):
    id: UUID
    component_version_id: UUID
    node_key: str
    node_type: str
    bpmn_element_type: str | None = None
    bpmn_event_kind: str | None = None
    bpmn_event_definition: str | None = None
    bpmn_task_type: str | None = None
    bpmn_gateway_type: str | None = None
    bpmn_subprocess_kind: str | None = None
    bpmn_call_activity_ref: str | None = None
    title: str
    description: str | None = None
    actor: str | None = None
    business_rule: str | None = None
    input_summary: str | None = None
    output_summary: str | None = None
    semantic_profile_key: str | None = None
    semantic_profile_version: int | None = None
    semantic_payload_json: dict[str, Any] = Field(default_factory=dict)
    task_ui_json: dict[str, Any] = Field(default_factory=dict)
    process_container_json: dict[str, Any] = Field(default_factory=dict)
    container_node_key: str | None = None
    position_x: float = 0
    position_y: float = 0
    width: float = 120
    height: float = 60
    er_refs: list[BusinessFlowNodeErRefDTO] = Field(default_factory=list)
    style_json: dict[str, Any] = Field(default_factory=dict)
    properties_json: dict[str, Any] = Field(default_factory=dict)


class SwimlaneComponentEdgeDTO(BaseModel):
    id: UUID
    component_version_id: UUID
    edge_key: str
    source_node_key: str
    target_node_key: str
    source_port: str | None = None
    target_port: str | None = None
    edge_type: str = "SEQUENCE"
    bpmn_flow_type: str | None = None
    bpmn_sequence_flow_kind: str | None = None
    bpmn_message_name: str | None = None
    bpmn_condition_expression: str | None = None
    label: str | None = None
    condition_text: str | None = None
    data_contract_json: dict[str, Any] = Field(default_factory=dict)
    semantic_profile_key: str | None = None
    semantic_profile_version: int | None = None
    semantic_payload_json: dict[str, Any] = Field(default_factory=dict)
    style_json: dict[str, Any] = Field(default_factory=dict)
    properties_json: dict[str, Any] = Field(default_factory=dict)


class SwimlaneComponentVersionDTO(BaseModel):
    id: UUID
    component_id: UUID
    version_no: int
    version_name: str | None = None
    status: str
    canvas_json: dict[str, Any] = Field(default_factory=dict)
    semantic_json: dict[str, Any] = Field(default_factory=dict)
    thumbnail_url: str | None = None
    checksum: str | None = None
    created_at: str
    published_at: str | None = None
    nodes: list[SwimlaneComponentNodeDTO] = Field(default_factory=list)
    edges: list[SwimlaneComponentEdgeDTO] = Field(default_factory=list)


class SwimlaneComponentResponse(BaseModel):
    id: UUID
    product_id: UUID
    product_code: str | None = None
    product_name: str | None = None
    code: str
    name: str
    category: str | None = None
    owner_role: str | None = None
    description: str | None = None
    status: str
    current_version_no: int
    created_at: str
    updated_at: str
    versions: list[SwimlaneComponentVersionDTO] = Field(default_factory=list)


class SwimlaneComponentCreateRequest(BaseModel):
    product_id: UUID
    code: str = Field(pattern=r"^[a-zA-Z0-9_-]+$", max_length=120)
    name: str = Field(min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=120)
    owner_role: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class SwimlaneComponentUpdateRequest(BaseModel):
    code: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9_-]+$", max_length=120)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=120)
    owner_role: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: str | None = None


class SwimlaneComponentNodeInput(BaseModel):
    node_key: str
    node_type: str
    bpmn_element_type: str | None = None
    bpmn_event_kind: str | None = None
    bpmn_event_definition: str | None = None
    bpmn_task_type: str | None = None
    bpmn_gateway_type: str | None = None
    bpmn_subprocess_kind: str | None = None
    bpmn_call_activity_ref: str | None = None
    title: str
    description: str | None = None
    actor: str | None = None
    business_rule: str | None = None
    input_summary: str | None = None
    output_summary: str | None = None
    semantic_profile_key: str | None = None
    semantic_profile_version: int | None = None
    semantic_payload_json: dict[str, Any] = Field(default_factory=dict)
    task_ui_json: dict[str, Any] = Field(default_factory=dict)
    process_container_json: dict[str, Any] = Field(default_factory=dict)
    container_node_key: str | None = None
    position_x: float = 0
    position_y: float = 0
    width: float = 120
    height: float = 60
    er_refs: list[BusinessFlowNodeErRefDTO] = Field(default_factory=list)
    style_json: dict[str, Any] = Field(default_factory=dict)
    properties_json: dict[str, Any] = Field(default_factory=dict)


class SwimlaneComponentEdgeInput(BaseModel):
    edge_key: str
    source_node_key: str
    target_node_key: str
    source_port: str | None = None
    target_port: str | None = None
    edge_type: str = "SEQUENCE"
    bpmn_flow_type: str | None = None
    bpmn_sequence_flow_kind: str | None = None
    bpmn_message_name: str | None = None
    bpmn_condition_expression: str | None = None
    label: str | None = None
    condition_text: str | None = None
    data_contract_json: dict[str, Any] = Field(default_factory=dict)
    semantic_profile_key: str | None = None
    semantic_profile_version: int | None = None
    semantic_payload_json: dict[str, Any] = Field(default_factory=dict)
    style_json: dict[str, Any] = Field(default_factory=dict)
    properties_json: dict[str, Any] = Field(default_factory=dict)


class SwimlaneComponentVersionSaveRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=120)
    owner_role: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    canvas_json: dict[str, Any] = Field(default_factory=dict)
    semantic_json: dict[str, Any] = Field(default_factory=dict)
    thumbnail_url: str | None = None
    nodes: list[SwimlaneComponentNodeInput] = Field(default_factory=list)
    edges: list[SwimlaneComponentEdgeInput] = Field(default_factory=list)


class BusinessFlowLaneInstanceDTO(BaseModel):
    id: UUID
    instance_key: str
    component_id: UUID
    component_version_id: UUID
    component_name: str | None = None
    component_version_no: int | None = None
    display_name: str
    owner_role: str | None = None
    position_x: float = 0
    position_y: float = 0
    width: float = 240
    height: float = 600
    z_index: int = 0
    is_overridden: bool = False
    layout_json: dict[str, Any] = Field(default_factory=dict)
    override_json: dict[str, Any] = Field(default_factory=dict)


class BusinessFlowNodeDTO(BaseModel):
    id: UUID
    lane_instance_id: UUID | None = None
    node_key: str
    origin_component_node_key: str | None = None
    node_type: str
    bpmn_element_type: str | None = None
    bpmn_event_kind: str | None = None
    bpmn_event_definition: str | None = None
    bpmn_task_type: str | None = None
    bpmn_gateway_type: str | None = None
    bpmn_subprocess_kind: str | None = None
    bpmn_call_activity_ref: str | None = None
    title: str
    description: str | None = None
    actor: str | None = None
    business_rule: str | None = None
    input_summary: str | None = None
    output_summary: str | None = None
    semantic_profile_key: str | None = None
    semantic_profile_version: int | None = None
    semantic_payload_json: dict[str, Any] = Field(default_factory=dict)
    task_ui_json: dict[str, Any] = Field(default_factory=dict)
    process_container_json: dict[str, Any] = Field(default_factory=dict)
    container_node_key: str | None = None
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
    source_node_key: str | None = None
    source_lane_instance_id: UUID | None = None
    source_lane_instance_key: str | None = None
    source_port: str | None = None
    target_type: str
    target_node_id: UUID | None = None
    target_node_key: str | None = None
    target_lane_instance_id: UUID | None = None
    target_lane_instance_key: str | None = None
    target_port: str | None = None
    edge_type: str = "SEQUENCE"
    bpmn_flow_type: str | None = None
    bpmn_sequence_flow_kind: str | None = None
    bpmn_message_name: str | None = None
    bpmn_condition_expression: str | None = None
    label: str | None = None
    condition_text: str | None = None
    data_contract_json: dict[str, Any] = Field(default_factory=dict)
    semantic_profile_key: str | None = None
    semantic_profile_version: int | None = None
    semantic_payload_json: dict[str, Any] = Field(default_factory=dict)
    origin_component_edge_key: str | None = None
    is_overridden: bool = False
    style_json: dict[str, Any] = Field(default_factory=dict)
    properties_json: dict[str, Any] = Field(default_factory=dict)


class PlaceSwimlaneComponentPayload(BaseModel):
    component_version_id: UUID
    position: dict[str, float]


class PlaceSwimlaneComponentResponse(BaseModel):
    lane_instance: BusinessFlowLaneInstanceDTO
    nodes: list[BusinessFlowNodeDTO] = Field(default_factory=list)
    edges: list[BusinessFlowEdgeDTO] = Field(default_factory=list)
    new_version: int


class BusinessFlowChangeOpPayload(BaseModel):
    op_type: str
    target_type: str
    target_key: str
    patch: dict[str, Any] = Field(default_factory=dict)
    inverse_patch: dict[str, Any] = Field(default_factory=dict)
    summary: str | None = None


class ApplyBusinessFlowChangesRequest(BaseModel):
    base_version: int
    source: str = "USER"
    ops: list[BusinessFlowChangeOpPayload] = Field(default_factory=list)


class ApplyBusinessFlowChangesResponse(BaseModel):
    new_version: int
    summary: str


class BusinessFlowEditorStateResponse(BaseModel):
    business_flow_id: UUID
    current_version: int
    collab_revision: int = 1
    canvas_json: dict[str, Any] = Field(default_factory=dict)
    semantic_json: dict[str, Any] = Field(default_factory=dict)
    lane_instances: list[BusinessFlowLaneInstanceDTO] = Field(default_factory=list)
    nodes: list[BusinessFlowNodeDTO] = Field(default_factory=list)
    edges: list[BusinessFlowEdgeDTO] = Field(default_factory=list)
    quality_issues: list[dict[str, Any]] = Field(default_factory=list)


class BusinessFlowHistoryOpDTO(BaseModel):
    op_type: str
    target_type: str
    target_key: str
    summary: str | None = None


class BusinessFlowHistoryItemDTO(BaseModel):
    version: int
    base_version: int
    source: str
    summary: str | None = None
    created_by: str | None = None
    created_at: str
    ops: list[BusinessFlowHistoryOpDTO] = Field(default_factory=list)


class RestoreBusinessFlowRequest(BaseModel):
    target_version: int


class RestoreBusinessFlowResponse(BaseModel):
    new_version: int
    restored_from_version: int
    summary: str
    editor_state: BusinessFlowEditorStateResponse
