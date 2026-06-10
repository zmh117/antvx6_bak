"""Business Flow Context enum values.

These values mirror the database check constraints in migration 008. They are
kept as literals for now so application services can adopt them without adding
runtime enum serialization decisions in this skeleton step.
"""

from __future__ import annotations

from typing import Literal

ComponentStatus = Literal["DRAFT", "PUBLISHED", "ARCHIVED"]
ComponentVersionStatus = Literal["DRAFT", "PUBLISHED"]
BusinessFlowStatus = Literal["DRAFT", "PUBLISHED", "ARCHIVED"]
LaneInstanceStatus = Literal["ACTIVE", "REMOVED"]
BusinessNodeType = Literal["START", "END", "TASK", "DECISION", "SERVICE", "MANUAL", "EVENT"]
BusinessEdgeEndpointType = Literal["NODE", "LANE"]
BusinessEdgeType = Literal[
    "SEQUENCE",
    "TRIGGER",
    "DATA_FLOW",
    "CALL",
    "DEPENDENCY",
    "EXCEPTION",
]
ErRefType = Literal["READ", "CREATE", "UPDATE", "DELETE", "CHECK"]
ChangeSource = Literal["USER", "YJS", "IMPORT", "RESTORE", "SYSTEM"]
ChangeTargetType = Literal["LANE_INSTANCE", "NODE", "EDGE", "ER_REF", "CANVAS"]
CollabOwnerType = Literal["BUSINESS_FLOW", "SWIMLANE_COMPONENT_DRAFT"]

COMPONENT_STATUSES: tuple[str, ...] = ("DRAFT", "PUBLISHED", "ARCHIVED")
COMPONENT_VERSION_STATUSES: tuple[str, ...] = ("DRAFT", "PUBLISHED")
BUSINESS_FLOW_STATUSES: tuple[str, ...] = ("DRAFT", "PUBLISHED", "ARCHIVED")
LANE_INSTANCE_STATUSES: tuple[str, ...] = ("ACTIVE", "REMOVED")
BUSINESS_NODE_TYPES: tuple[str, ...] = (
    "START",
    "END",
    "TASK",
    "DECISION",
    "SERVICE",
    "MANUAL",
    "EVENT",
)
BUSINESS_EDGE_ENDPOINT_TYPES: tuple[str, ...] = ("NODE", "LANE")
BUSINESS_EDGE_TYPES: tuple[str, ...] = (
    "SEQUENCE",
    "TRIGGER",
    "DATA_FLOW",
    "CALL",
    "DEPENDENCY",
    "EXCEPTION",
)
ER_REF_TYPES: tuple[str, ...] = ("READ", "CREATE", "UPDATE", "DELETE", "CHECK")
CHANGE_SOURCES: tuple[str, ...] = ("USER", "YJS", "IMPORT", "RESTORE", "SYSTEM")
CHANGE_TARGET_TYPES: tuple[str, ...] = ("LANE_INSTANCE", "NODE", "EDGE", "ER_REF", "CANVAS")
COLLAB_OWNER_TYPES: tuple[str, ...] = ("BUSINESS_FLOW", "SWIMLANE_COMPONENT_DRAFT")
