"""Task UI test context and validation helpers."""

from __future__ import annotations

from typing import Any, Mapping

ELEMENT_ACTIONS = {
    "ContextMenu": {"rightClick", "selectMenuItem", "assertVisible"},
    "Button": {"click", "doubleClick", "assertVisible"},
    "Checkbox": {"check", "uncheck", "toggle", "assertVisible", "assertValue"},
    "DataTable": {"search", "filter", "sort", "selectRow", "assertCell", "assertVisible"},
    "DatePicker": {"selectDate", "selectRange", "clear", "assertVisible", "assertValue"},
    "Input": {"input", "clear", "assertVisible", "assertText", "assertValue"},
    "Label": {"assertText", "assertVisible"},
    "RadioGroup": {"select", "assertVisible", "assertValue"},
    "Select": {"select", "search", "clear", "assertVisible", "assertValue"},
    "Textarea": {"input", "clear", "assertVisible", "assertText"},
}
ACTION_DEFAULTS = {
    "ContextMenu": "rightClick",
    "Button": "click",
    "Checkbox": "check",
    "DataTable": "assertCell",
    "DatePicker": "selectDate",
    "Input": "input",
    "Label": "assertText",
    "RadioGroup": "select",
    "Select": "select",
    "Textarea": "input",
}
ELEMENT_TYPES = set(ELEMENT_ACTIONS)
ACTION_TYPES = {action for actions in ELEMENT_ACTIONS.values() for action in actions}
TASK_TYPES = {"userTask", "serviceTask", "manualTask"}
VALUE_SOURCES = {"fixed", "testData", "previousStep", "apiResponse"}


def json_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def task_ui_payload(value: Any, fallback_task_name: str | None = None) -> dict[str, Any]:
    source = json_object(value)
    page = json_object(source.get("page"))
    task_name = _text(source.get("taskName")) or _text(fallback_task_name) or ""
    url_pattern = _text(page.get("urlPattern")) or _text(page.get("routePattern")) or ""
    return {
        "taskName": task_name,
        "taskType": _one_of(source.get("taskType"), TASK_TYPES, "userTask"),
        "actor": _text(source.get("actor")) or "",
        "businessIntent": _text(source.get("businessIntent")) or "",
        "businessRules": _text_list(source.get("businessRules")),
        "preconditions": _text_list(source.get("preconditions")),
        "postconditions": _text_list(source.get("postconditions")),
        "page": {
            "pageName": _text(page.get("pageName")) or "",
            "urlPattern": url_pattern,
            "routePattern": url_pattern,
            "moduleName": _text(page.get("moduleName")) or "",
        },
        "uiSteps": [_step_payload(item, index) for index, item in enumerate(_list(source.get("uiSteps")))],
        "inputDataRefs": _text_list(source.get("inputDataRefs")),
        "outputDataRefs": _text_list(source.get("outputDataRefs")),
        "expectedResults": _text_list(source.get("expectedResults")),
        "assertions": _assertions(source.get("assertions")),
        "mockRequirements": _text_list(source.get("mockRequirements")),
    }


def _step_payload(value: Any, index: int) -> dict[str, Any]:
    step = json_object(value)
    element_type = _normalize_element_type(step.get("elementType"))
    action_type = _one_of(step.get("actionType"), ACTION_TYPES, ACTION_DEFAULTS[element_type])
    payload = {
        "id": _text(step.get("id")) or f"step_{index + 1}",
        "stepNo": _int(step.get("stepNo")) or index + 1,
        "elementType": element_type,
        "elementName": _text(step.get("elementName")) or "",
        "actionType": action_type,
        "elementLocationHint": _text(step.get("elementLocationHint")) or "",
        "value": step.get("value"),
        "valueSource": _one_of(step.get("valueSource"), VALUE_SOURCES, "fixed"),
        "required": _bool(step.get("required")),
        "businessMeaning": _text(step.get("businessMeaning")) or "",
        "expectedState": _text(step.get("expectedState")) or "",
        "expectedResult": _text(step.get("expectedResult")) or "",
        "screenshotRequired": _bool(step.get("screenshotRequired")),
        "waitCondition": _text(step.get("waitCondition")) or "",
        "negativeTestHints": _text_list(step.get("negativeTestHints")),
    }
    for key in (
        "buttonText",
        "buttonRole",
        "disabledCondition",
        "inputType",
        "placeholder",
        "pattern",
        "optionSource",
        "optionApiRef",
        "layout",
        "labelText",
        "checkedMeaning",
        "uncheckedMeaning",
        "pickerType",
        "dateFormat",
        "minDate",
        "maxDate",
        "selectedDate",
        "timezone",
        "rowKey",
        "triggerElement",
        "triggerAction",
        "selectedMenuItem",
        "visibleCondition",
        "associatedControl",
        "accessibilityName",
        "expectedText",
    ):
        payload[key] = _text(step.get(key)) or ""
    for key in (
        "confirmRequired",
        "loadingExpected",
        "clearBeforeInput",
        "allowLineBreak",
        "sensitive",
        "multiple",
        "searchable",
        "clearable",
        "checked",
        "requiredToSubmit",
        "pagination",
        "selectable",
        "requiredMark",
    ):
        payload[key] = _bool(step.get(key))
    for key in ("minLength", "maxLength", "rows"):
        payload[key] = _int(step.get(key))
    for key in ("testValues", "invalidValues", "disabledOptions", "disabledDates", "sortableColumns", "filterableColumns", "assertionRules", "disabledMenuItems"):
        payload[key] = _text_list(step.get(key))
    for key in ("options", "presets", "rowActions", "menuItems"):
        payload[key] = _options(step.get(key))
    payload["defaultValue"] = step.get("defaultValue")
    payload["selectedValue"] = step.get("selectedValue")
    payload["selectedRange"] = json_object(step.get("selectedRange")) or None
    payload["columns"] = _columns(step.get("columns"))
    payload["expectedRows"] = [json_object(item) for item in _list(step.get("expectedRows")) if json_object(item)]
    return payload


def task_ui_quality_issues(node: Mapping[str, Any]) -> list[dict[str, Any]]:
    if node.get("bpmn_element_type") != "TASK":
        return []
    node_key = str(node.get("node_key") or "")
    payload = task_ui_payload(node.get("task_ui_json"), fallback_task_name=node.get("title"))
    page = json_object(payload.get("page"))
    steps = _list(payload.get("uiSteps"))
    issues: list[dict[str, Any]] = []
    if not _text(payload.get("taskName")):
        issues.append(_issue("NODE", node_key, "TASK_UI_MISSING_TASK_NAME", "Task 缺少任务名称，Agent 生成 Web 用例可能不完整。"))
    if not _text(page.get("pageName")):
        issues.append(_issue("NODE", node_key, "TASK_UI_MISSING_PAGE", "Task 缺少页面名称，Agent 生成 Web 用例可能不完整。"))
    if not steps:
        issues.append(_issue("NODE", node_key, "TASK_UI_MISSING_STEPS", "Task 缺少 UI 操作步骤，Agent 生成操作步骤可能不完整。"))
    previous_step_no = 0
    has_flow_expected_result = bool(payload.get("expectedResults"))
    for index, raw_step in enumerate(steps):
        step = json_object(raw_step)
        step_no = _int(step.get("stepNo")) or index + 1
        element_type = _text(step.get("elementType"))
        action_type = _text(step.get("actionType"))
        if step_no < previous_step_no:
            issues.append(_issue("NODE", node_key, "TASK_UI_STEP_ORDER", "UI 操作步骤的 stepNo 顺序不稳定。"))
        previous_step_no = step_no
        if not _text(step.get("elementName")):
            issues.append(_issue("NODE", node_key, "TASK_UI_STEP_MISSING_ELEMENT", f"第 {index + 1} 步缺少元素名称。"))
        if element_type not in ELEMENT_TYPES:
            issues.append(_issue("NODE", node_key, "TASK_UI_INVALID_ELEMENT_TYPE", f"第 {index + 1} 步元素类型不受控。"))
        if action_type not in ACTION_TYPES:
            issues.append(_issue("NODE", node_key, "TASK_UI_INVALID_ACTION_TYPE", f"第 {index + 1} 步操作动作不受控。"))
        allowed = ELEMENT_ACTIONS.get(element_type or "")
        if allowed and action_type not in allowed:
            issues.append(_issue("NODE", node_key, "TASK_UI_ACTION_MISMATCH", f"第 {index + 1} 步元素类型与操作动作不匹配。"))
        if not _text(step.get("expectedResult")) and not has_flow_expected_result:
            issues.append(_issue("NODE", node_key, "TASK_UI_STEP_MISSING_EXPECTED_RESULT", f"第 {index + 1} 步缺少预期结果。"))
        if element_type == "Select" and not _list(step.get("options")):
            issues.append(_issue("NODE", node_key, "TASK_UI_SELECT_MISSING_OPTIONS", f"第 {index + 1} 步下拉选择缺少选项。"))
        if element_type == "DataTable" and not _list(step.get("columns")) and not _list(step.get("assertionRules")):
            issues.append(_issue("NODE", node_key, "TASK_UI_TABLE_MISSING_ASSERTION", f"第 {index + 1} 步数据表格缺少列或表格断言。"))
        if element_type == "ContextMenu" and not _list(step.get("menuItems")):
            issues.append(_issue("NODE", node_key, "TASK_UI_CONTEXT_MENU_MISSING_ITEMS", f"第 {index + 1} 步右键菜单缺少菜单项。"))
    return issues


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _text_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.splitlines() if item.strip()]
    return []


def _one_of(value: Any, allowed: set[str], fallback: str) -> str:
    text = _text(value)
    return text if text in allowed else fallback


def _normalize_element_type(value: Any) -> str:
    text = _text(value)
    aliases = {
        "Radio": "RadioGroup",
        "Data Table": "DataTable",
        "Date Picker": "DatePicker",
        "Context Menu": "ContextMenu",
    }
    text = aliases.get(text or "", text)
    return text if text in ELEMENT_TYPES else "Input"


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value == "true":
        return True
    return False


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _options(value: Any) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    for item in _list(value):
        raw = json_object(item)
        label = _text(raw.get("label"))
        option_value = _text(raw.get("value"))
        if not label and not option_value:
            continue
        options.append({
            "label": label or option_value,
            "value": option_value or label,
            "businessMeaning": _text(raw.get("businessMeaning")),
        })
    return options


def _columns(value: Any) -> list[dict[str, str]]:
    columns: list[dict[str, str]] = []
    for item in _list(value):
        raw = json_object(item)
        title = _text(raw.get("title"))
        field = _text(raw.get("field"))
        if not title and not field:
            continue
        columns.append({"title": title or field or "", "field": field or title or ""})
    return columns


def _assertions(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    return _text_list(value)


def _issue(target_type: str, target_key: str, code: str, message: str) -> dict[str, Any]:
    return {
        "severity": "warning",
        "targetType": target_type,
        "targetKey": target_key,
        "code": code,
        "message": message,
    }
