"""Task UI test context and process-container validation helpers."""

from __future__ import annotations

from typing import Any, Mapping

ELEMENT_ACTIONS = {
    "Button": {"click", "assertVisible"},
    "Input": {"input", "assertVisible", "assertText"},
    "Select": {"select", "assertVisible", "assertText"},
    "Checkbox": {"check", "uncheck", "assertVisible"},
    "Radio": {"select", "assertVisible"},
    "DatePicker": {"select", "input", "assertVisible"},
    "Upload": {"upload", "assertVisible"},
    "DataTable": {"assertData", "assertVisible"},
    "Dialog": {"assertVisible", "assertText"},
    "Label": {"assertVisible", "assertText"},
}
ELEMENT_TYPES = set(ELEMENT_ACTIONS)
ACTION_TYPES = {action for actions in ELEMENT_ACTIONS.values() for action in actions} | {"wait"}
CONTAINER_MODES = {"embedded", "reusableCall"}


def json_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def task_ui_payload(value: Any) -> dict[str, Any]:
    return json_object(value)


def process_container_payload(value: Any) -> dict[str, Any]:
    data = json_object(value)
    if not data:
        return {}
    mode = data.get("containerMode")
    if mode not in CONTAINER_MODES:
        mode = "embedded"
    return {
        "containerMode": mode,
        "calledProcessRef": _text(data.get("calledProcessRef")),
        "calledProcessVersion": _text(data.get("calledProcessVersion")),
    }


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def task_ui_quality_issues(node: Mapping[str, Any]) -> list[dict[str, Any]]:
    if node.get("bpmn_element_type") != "TASK":
        return []
    node_key = str(node.get("node_key") or "")
    payload = task_ui_payload(node.get("task_ui_json"))
    page = json_object(payload.get("page"))
    steps = _list(payload.get("uiSteps"))
    issues: list[dict[str, Any]] = []
    if not _text(page.get("pageName")):
        issues.append(_issue("NODE", node_key, "TASK_UI_MISSING_PAGE", "Task 缺少页面名称，Agent 生成 Web 用例可能不完整。"))
    if not steps:
        issues.append(_issue("NODE", node_key, "TASK_UI_MISSING_STEPS", "Task 缺少 UI Steps，Agent 生成操作步骤可能不完整。"))
    previous_step_no = 0
    for index, raw_step in enumerate(steps):
        step = json_object(raw_step)
        step_no = _int(step.get("stepNo")) or index + 1
        element_type = _text(step.get("elementType"))
        action_type = _text(step.get("actionType"))
        if step_no < previous_step_no:
            issues.append(_issue("NODE", node_key, "TASK_UI_STEP_ORDER", "UI Steps 的 stepNo 顺序不稳定。"))
        previous_step_no = step_no
        if not _text(step.get("elementName")):
            issues.append(_issue("NODE", node_key, "TASK_UI_STEP_MISSING_ELEMENT", f"第 {index + 1} 步缺少控件名称。"))
        if element_type not in ELEMENT_TYPES:
            issues.append(_issue("NODE", node_key, "TASK_UI_INVALID_ELEMENT_TYPE", f"第 {index + 1} 步控件类型不受控。"))
        if action_type not in ACTION_TYPES:
            issues.append(_issue("NODE", node_key, "TASK_UI_INVALID_ACTION_TYPE", f"第 {index + 1} 步动作类型不受控。"))
        allowed = ELEMENT_ACTIONS.get(element_type or "")
        if allowed and action_type not in allowed:
            issues.append(_issue("NODE", node_key, "TASK_UI_ACTION_MISMATCH", f"第 {index + 1} 步控件类型与动作类型不匹配。"))
    return issues


def process_container_quality_issues(
    node: Mapping[str, Any],
    child_keys: list[str] | None = None,
) -> list[dict[str, Any]]:
    if not is_process_container(node):
        return []
    node_key = str(node.get("node_key") or "")
    payload = process_container_payload(node.get("process_container_json"))
    issues: list[dict[str, Any]] = []
    if not child_keys:
        issues.append(_issue("NODE", node_key, "EMPTY_PROCESS_CONTAINER", "流程容器缺少内部节点。"))
    if payload.get("containerMode") == "reusableCall" and not payload.get("calledProcessRef"):
        issues.append(_issue("NODE", node_key, "REUSABLE_CALL_MISSING_REF", "可复用调用模式缺少被调用流程引用。"))
    return issues


def is_process_container(node: Mapping[str, Any]) -> bool:
    payload = json_object(node.get("process_container_json"))
    return (
        node.get("bpmn_element_type") == "SUB_PROCESS"
        and node.get("bpmn_subprocess_kind") == "EMBEDDED"
    ) or payload.get("containerMode") in CONTAINER_MODES


def container_structure_error(nodes: list[Mapping[str, Any]]) -> str | None:
    node_by_key = {str(node.get("node_key")): node for node in nodes if node.get("node_key")}
    for node in nodes:
        node_key = str(node.get("node_key") or "")
        container_key = _text(node.get("container_node_key"))
        if not container_key:
            continue
        if container_key == node_key:
            return f"node {node_key} cannot contain itself"
        container = node_by_key.get(container_key)
        if not container:
            return f"container node not found: {container_key}"
        if not is_process_container(container):
            return f"container node is not a process container: {container_key}"
        if _text(container.get("container_node_key")):
            return "nested process containers are not supported"
    return None


def edge_scope(source_container_key: str | None, target_container_key: str | None) -> str:
    if not source_container_key and not target_container_key:
        return "topLevel"
    if source_container_key and source_container_key == target_container_key:
        return "insideContainer"
    return "crossContainerBoundary"


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _issue(target_type: str, target_key: str, code: str, message: str) -> dict[str, Any]:
    return {
        "severity": "warning",
        "targetType": target_type,
        "targetKey": target_key,
        "code": code,
        "message": message,
    }
