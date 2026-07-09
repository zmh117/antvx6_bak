"""Business semantic profiles for domain-specific meaning on top of BPMN."""

from __future__ import annotations

from typing import Any, Literal, Mapping

from app.domain.business_flow.task_ui import (
    is_process_container,
    process_container_quality_issues,
    task_ui_quality_issues,
)

SemanticScope = Literal["FLOW", "NODE", "EDGE"]

GENERIC_PROFILE_KEY = "generic-business-operation"
MES_NODE_PROFILE_KEY = "mes-manufacturing-node"
MES_EDGE_PROFILE_KEY = "mes-manufacturing-edge"

MES_OPERATION_TYPES = {
    "RECEIVE_MATERIAL",
    "WEIGH",
    "DISPENSE",
    "MIX",
    "REACT",
    "SAMPLE",
    "QC_CHECK",
    "RELEASE",
    "PACK",
    "TRANSFER",
    "CLEAN",
    "STERILIZE",
    "RECORD_AUDIT",
    "HANDLE_DEVIATION",
}
MES_BUSINESS_OBJECTS = {
    "WORK_ORDER",
    "BATCH",
    "MATERIAL_LOT",
    "RECIPE",
    "EQUIPMENT",
    "PROCESS_PARAMETER",
    "QC_RESULT",
    "EBR",
    "AUDIT_TRAIL",
}
MES_RESOURCE_TYPES = {"OPERATOR", "EQUIPMENT", "WORKCENTER", "SYSTEM"}
MES_EXCEPTION_TYPES = {
    "QUALITY_FAILED",
    "MATERIAL_SHORTAGE",
    "EQUIPMENT_FAILURE",
    "PARAMETER_OUT_OF_RANGE",
    "SIGNATURE_REJECTED",
}


def semantic_payload(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def semantic_profile_key(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def semantic_profile_version(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _as_upper_set(values: Any) -> set[str]:
    if not isinstance(values, list):
        return set()
    return {str(value).strip().upper() for value in values if str(value).strip()}


def _enum_error(payload: Mapping[str, Any], key: str, allowed: set[str]) -> str | None:
    value = payload.get(key)
    if value in (None, ""):
        return None
    if str(value).strip().upper() not in allowed:
        return f"unsupported {key}: {value}"
    return None


def _enum_list_error(payload: Mapping[str, Any], key: str, allowed: set[str]) -> str | None:
    values = payload.get(key)
    if values in (None, ""):
        return None
    if not isinstance(values, list):
        return f"{key} must be a list"
    invalid = _as_upper_set(values) - allowed
    if invalid:
        return f"unsupported {key}: {', '.join(sorted(invalid))}"
    return None


def semantic_payload_error(
    profile_key: str | None,
    payload: Mapping[str, Any] | None,
    target_scope: SemanticScope,
) -> str | None:
    data = payload or {}
    if not profile_key:
        return None if not data else "semantic payload requires semantic profile key"

    if profile_key == MES_NODE_PROFILE_KEY:
        if target_scope != "NODE":
            return f"profile {profile_key} only supports NODE"
        return (
            _enum_error(data, "operationType", MES_OPERATION_TYPES)
            or _enum_error(data, "businessObject", MES_BUSINESS_OBJECTS)
            or _enum_list_error(data, "resourceTypes", MES_RESOURCE_TYPES)
            or _enum_list_error(data, "exceptionHandlers", MES_EXCEPTION_TYPES)
        )

    if profile_key == MES_EDGE_PROFILE_KEY:
        if target_scope != "EDGE":
            return f"profile {profile_key} only supports EDGE"
        return _enum_error(data, "exceptionType", MES_EXCEPTION_TYPES)

    if profile_key == GENERIC_PROFILE_KEY:
        return None

    return None


def build_semantic_profile_doc() -> list[dict[str, Any]]:
    return [
        {
            "profile_key": GENERIC_PROFILE_KEY,
            "domain": "generic",
            "target_scope": "NODE",
            "version": 1,
            "name": "Generic business operation",
            "taxonomy_json": {},
        },
        {
            "profile_key": MES_NODE_PROFILE_KEY,
            "domain": "mes",
            "target_scope": "NODE",
            "version": 1,
            "name": "MES manufacturing step",
            "taxonomy_json": {
                "operationType": sorted(MES_OPERATION_TYPES),
                "businessObject": sorted(MES_BUSINESS_OBJECTS),
                "resourceType": sorted(MES_RESOURCE_TYPES),
                "exceptionType": sorted(MES_EXCEPTION_TYPES),
            },
        },
        {
            "profile_key": MES_EDGE_PROFILE_KEY,
            "domain": "mes",
            "target_scope": "EDGE",
            "version": 1,
            "name": "MES manufacturing handoff",
            "taxonomy_json": {
                "exceptionType": sorted(MES_EXCEPTION_TYPES),
            },
        },
    ]


def business_flow_quality_issues(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    refs_by_node_key: dict[str, list[dict[str, Any]]] | None = None,
) -> list[dict[str, Any]]:
    refs = refs_by_node_key or {}
    issues: list[dict[str, Any]] = []
    outgoing_by_node: dict[str, list[dict[str, Any]]] = {}
    children_by_container: dict[str, list[str]] = {}
    for edge in edges:
        source_key = edge.get("source_node_key")
        if source_key:
            outgoing_by_node.setdefault(str(source_key), []).append(edge)
    for node in nodes:
        container_key = node.get("container_node_key")
        node_key = node.get("node_key")
        if container_key and node_key:
            children_by_container.setdefault(str(container_key), []).append(str(node_key))
    for node in nodes:
        node_key = str(node.get("node_key") or "")
        payload = semantic_payload(node.get("semantic_payload_json"))
        profile_key = semantic_profile_key(node.get("semantic_profile_key"))
        element_type = node.get("bpmn_element_type")
        if profile_key and element_type == "TASK" and not payload.get("operationType"):
            issues.append(
                {
                    "severity": "warning",
                    "targetType": "NODE",
                    "targetKey": node_key,
                    "code": "MISSING_OPERATION_TYPE",
                    "message": "已选择业务语义 Profile，但任务缺少操作类型。",
                }
            )
        if element_type in {"DATA_OBJECT", "DATA_INPUT", "DATA_OUTPUT", "DATA_STORE"}:
            if not payload.get("businessObject") and not refs.get(node_key):
                issues.append(
                    {
                        "severity": "info",
                        "targetType": "NODE",
                        "targetKey": node_key,
                        "code": "DATA_NODE_WITHOUT_BUSINESS_OBJECT",
                        "message": "数据节点缺少业务对象或 ER 绑定。",
                    }
                )
        if element_type == "GATEWAY":
            for edge in outgoing_by_node.get(node_key, []):
                edge_payload = semantic_payload(edge.get("semantic_payload_json"))
                if not (
                    edge.get("condition_text")
                    or edge.get("bpmn_condition_expression")
                    or edge_payload.get("condition")
                ):
                    issues.append(
                        {
                            "severity": "warning",
                            "targetType": "EDGE",
                            "targetKey": edge.get("edge_key"),
                            "code": "MISSING_GATEWAY_CONDITION",
                            "message": "网关出边缺少条件，Agent 难以判断分支场景。",
                        }
                    )
        issues.extend(task_ui_quality_issues(node))
        if is_process_container(node):
            issues.extend(
                process_container_quality_issues(
                    node,
                    children_by_container.get(node_key, []),
                )
            )
    return issues
