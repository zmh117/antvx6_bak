"""Domain entities for reusable swimlane components and business flows."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from app.domain.business_flow.enums import (
    BusinessEdgeEndpointType,
    BusinessEdgeType,
    BusinessFlowStatus,
    BusinessFlowRole,
    BusinessNodeType,
    ChangeSource,
    ChangeTargetType,
    CollabOwnerType,
    ComponentStatus,
    ComponentVersionStatus,
    LaneInstanceStatus,
)
from app.domain.business_flow.value_objects import ErReference, JsonDict


@dataclass(slots=True)
class Product:
    id: UUID
    code: str
    name: str
    description: str | None = None
    status: str = "active"


@dataclass(slots=True)
class SwimlaneComponent:
    id: UUID
    product_id: UUID
    code: str
    name: str
    category: str | None = None
    owner_role: str | None = None
    description: str | None = None
    status: ComponentStatus = "DRAFT"
    current_version_no: int = 0


@dataclass(slots=True)
class SwimlaneComponentVersion:
    id: UUID
    component_id: UUID
    version_no: int
    version_name: str | None = None
    canvas_json: JsonDict = field(default_factory=dict)
    semantic_json: JsonDict = field(default_factory=dict)
    thumbnail_url: str | None = None
    status: ComponentVersionStatus = "DRAFT"
    checksum: str | None = None
    published_at: datetime | None = None


@dataclass(slots=True)
class SwimlaneComponentNode:
    id: UUID
    component_version_id: UUID
    node_key: str
    node_type: BusinessNodeType
    title: str
    bpmn_element_type: str | None = None
    bpmn_event_kind: str | None = None
    bpmn_event_definition: str | None = None
    bpmn_task_type: str | None = None
    bpmn_gateway_type: str | None = None
    bpmn_subprocess_kind: str | None = None
    position_x: float = 0
    position_y: float = 0
    width: float = 120
    height: float = 60
    er_refs: list[ErReference] = field(default_factory=list)
    style_json: JsonDict = field(default_factory=dict)
    properties_json: JsonDict = field(default_factory=dict)
    bpmn_semantic_json: JsonDict = field(default_factory=dict)


@dataclass(slots=True)
class SwimlaneComponentEdge:
    id: UUID
    component_version_id: UUID
    edge_key: str
    source_node_key: str
    target_node_key: str
    edge_type: BusinessEdgeType = "SEQUENCE"
    bpmn_flow_type: str | None = None
    bpmn_sequence_flow_kind: str | None = None
    source_port: str | None = None
    target_port: str | None = None
    label: str | None = None
    style_json: JsonDict = field(default_factory=dict)
    properties_json: JsonDict = field(default_factory=dict)
    bpmn_semantic_json: JsonDict = field(default_factory=dict)


@dataclass(slots=True)
class BusinessFlowModel:
    id: UUID
    product_id: UUID
    code: str
    name: str
    description: str | None = None
    status: BusinessFlowStatus = "DRAFT"
    current_version: int = 1


@dataclass(slots=True)
class BusinessFlowMember:
    business_flow_id: UUID
    user_id: UUID
    role: BusinessFlowRole = "viewer"


@dataclass(slots=True)
class LaneInstance:
    id: UUID
    business_flow_id: UUID
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
    layout_json: JsonDict = field(default_factory=dict)
    override_json: JsonDict = field(default_factory=dict)
    status: LaneInstanceStatus = "ACTIVE"


@dataclass(slots=True)
class BusinessFlowNode:
    id: UUID
    business_flow_id: UUID
    node_key: str
    node_type: BusinessNodeType
    title: str
    lane_instance_id: UUID | None = None
    origin_component_node_key: str | None = None
    bpmn_element_type: str | None = None
    bpmn_event_kind: str | None = None
    bpmn_event_definition: str | None = None
    bpmn_task_type: str | None = None
    bpmn_gateway_type: str | None = None
    bpmn_subprocess_kind: str | None = None
    position_x: float = 0
    position_y: float = 0
    width: float = 120
    height: float = 60
    is_overridden: bool = False
    style_json: JsonDict = field(default_factory=dict)
    properties_json: JsonDict = field(default_factory=dict)
    bpmn_semantic_json: JsonDict = field(default_factory=dict)
    er_refs: list[ErReference] = field(default_factory=list)


@dataclass(slots=True)
class BusinessFlowEdge:
    id: UUID
    business_flow_id: UUID
    edge_key: str
    source_type: BusinessEdgeEndpointType
    target_type: BusinessEdgeEndpointType
    edge_type: BusinessEdgeType = "SEQUENCE"
    lane_instance_id: UUID | None = None
    source_node_id: UUID | None = None
    source_lane_instance_id: UUID | None = None
    source_port: str | None = None
    target_node_id: UUID | None = None
    target_lane_instance_id: UUID | None = None
    target_port: str | None = None
    label: str | None = None
    bpmn_flow_type: str | None = None
    bpmn_sequence_flow_kind: str | None = None
    origin_component_edge_key: str | None = None
    is_overridden: bool = False
    style_json: JsonDict = field(default_factory=dict)
    properties_json: JsonDict = field(default_factory=dict)
    bpmn_semantic_json: JsonDict = field(default_factory=dict)


@dataclass(slots=True)
class BusinessFlowNodeErRef:
    id: UUID
    business_flow_id: UUID
    business_flow_node_id: UUID
    reference: ErReference


@dataclass(slots=True)
class BusinessFlowChangeBatch:
    id: UUID
    business_flow_id: UUID
    base_version: int
    new_version: int
    source: ChangeSource = "USER"
    summary: str | None = None


@dataclass(slots=True)
class BusinessFlowChangeOp:
    id: UUID
    batch_id: UUID
    op_seq: int
    op_type: str
    target_type: ChangeTargetType
    target_key: str
    patch_json: JsonDict = field(default_factory=dict)
    inverse_patch_json: JsonDict = field(default_factory=dict)
    summary: str | None = None


@dataclass(slots=True)
class BusinessFlowSnapshot:
    id: UUID
    business_flow_id: UUID
    version: int
    canvas_json: JsonDict = field(default_factory=dict)
    semantic_json: JsonDict = field(default_factory=dict)


@dataclass(slots=True)
class CollabDocument:
    id: UUID
    owner_type: CollabOwnerType
    owner_id: UUID
    ydoc_state: bytes = b""
    server_version: int = 1
