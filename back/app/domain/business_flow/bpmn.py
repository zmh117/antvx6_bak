"""Canonical BPMN subset shared by business-flow application paths."""

from __future__ import annotations

from typing import Any, Mapping

ALLOWED_NODE_TYPES = {
    "START",
    "END",
    "EVENT",
    "TASK",
    "GATEWAY",
    "SUB_PROCESS",
    "DATA_OBJECT",
    "DATA_INPUT",
    "DATA_OUTPUT",
    "DATA_STORE",
}
ALLOWED_ELEMENT_TYPES = {
    "EVENT",
    "TASK",
    "GATEWAY",
    "SUB_PROCESS",
    "DATA_OBJECT",
    "DATA_INPUT",
    "DATA_OUTPUT",
    "DATA_STORE",
}
ALLOWED_EVENT_KINDS = {"START", "INTERMEDIATE", "END"}
ALLOWED_GATEWAY_TYPES = {"EXCLUSIVE", "INCLUSIVE", "PARALLEL", "COMPLEX"}
ALLOWED_SUBPROCESS_KINDS = {"EMBEDDED", "TRANSACTION"}
DATA_ELEMENT_TYPES = {"DATA_OBJECT", "DATA_INPUT", "DATA_OUTPUT", "DATA_STORE"}
MES_KEYS = {"mes", "mesSemantics", "mes_semantics_json"}


def strip_mes_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: strip_mes_json(item)
            for key, item in value.items()
            if key not in MES_KEYS
        }
    if isinstance(value, list):
        return [strip_mes_json(item) for item in value]
    return value


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def node_profile_error(node: Mapping[str, Any]) -> str | None:
    node_type = _text(node.get("node_type") or node.get("nodeType"))
    element_type = _text(
        node.get("bpmn_element_type") or node.get("bpmnElementType")
    )
    event_kind = _text(node.get("bpmn_event_kind") or node.get("bpmnEventKind"))
    event_definition = _text(
        node.get("bpmn_event_definition") or node.get("bpmnEventDefinition")
    )
    task_type = _text(node.get("bpmn_task_type") or node.get("bpmnTaskType"))
    gateway_type = _text(
        node.get("bpmn_gateway_type") or node.get("bpmnGatewayType")
    )
    subprocess_kind = _text(
        node.get("bpmn_subprocess_kind") or node.get("bpmnSubProcessKind")
    )

    if node_type not in ALLOWED_NODE_TYPES:
        return f"unsupported node_type: {node_type or '<empty>'}"
    if element_type not in ALLOWED_ELEMENT_TYPES:
        return f"unsupported bpmn_element_type: {element_type or '<empty>'}"

    if element_type == "EVENT":
        expected_kind = {
            "START": "START",
            "END": "END",
            "EVENT": "INTERMEDIATE",
        }.get(node_type)
        if event_kind != expected_kind:
            return f"event kind {event_kind or '<empty>'} does not match {node_type}"
        if event_definition not in {None, "NONE"}:
            return f"unsupported event definition: {event_definition}"
        return None

    if element_type == "TASK":
        if node_type != "TASK" or task_type not in {None, "NONE"}:
            return "only the generic BPMN task is supported"
        return None

    if element_type == "GATEWAY":
        if node_type != "GATEWAY" or gateway_type not in ALLOWED_GATEWAY_TYPES:
            return f"unsupported gateway type: {gateway_type or '<empty>'}"
        return None

    if element_type == "SUB_PROCESS":
        if node_type != "SUB_PROCESS" or subprocess_kind not in ALLOWED_SUBPROCESS_KINDS:
            return f"unsupported subprocess kind: {subprocess_kind or '<empty>'}"
        return None

    if element_type in DATA_ELEMENT_TYPES:
        return None if node_type == element_type else f"data node_type must be {element_type}"

    return f"unsupported BPMN profile: {element_type}"


def is_data_node(node: Mapping[str, Any] | None) -> bool:
    if not node:
        return False
    return _text(
        node.get("bpmn_element_type") or node.get("bpmnElementType")
    ) in DATA_ELEMENT_TYPES


def edge_profile_error(
    edge: Mapping[str, Any],
    source_node: Mapping[str, Any] | None,
    target_node: Mapping[str, Any] | None,
) -> str | None:
    if not (is_data_node(source_node) or is_data_node(target_node)):
        return None
    edge_type = _text(edge.get("edge_type") or edge.get("edgeType"))
    flow_type = _text(edge.get("bpmn_flow_type") or edge.get("bpmnFlowType"))
    if edge_type != "ASSOCIATION" or flow_type != "ASSOCIATION":
        return "data nodes can only be connected with BPMN association edges"
    return None
