"""Type-specific business semantics for non-Task BPMN elements."""

from __future__ import annotations

from typing import Any, Mapping

SCHEMA_VERSION = 1
DATA_ELEMENT_TYPES = {"DATA_OBJECT", "DATA_INPUT", "DATA_OUTPUT", "DATA_STORE"}

NODE_SEMANTIC_TYPES = {
    ("EVENT", "START", None, None): "startEvent",
    ("EVENT", "INTERMEDIATE", None, None): "intermediateEvent",
    ("EVENT", "END", None, None): "endEvent",
    ("SUB_PROCESS", None, None, "TRANSACTION"): "transaction",
    ("GATEWAY", None, "EXCLUSIVE", None): "exclusiveGateway",
    ("GATEWAY", None, "INCLUSIVE", None): "inclusiveGateway",
    ("GATEWAY", None, "PARALLEL", None): "parallelGateway",
    ("GATEWAY", None, "COMPLEX", None): "complexGateway",
    ("DATA_OBJECT", None, None, None): "dataObject",
    ("DATA_INPUT", None, None, None): "dataInput",
    ("DATA_OUTPUT", None, None, None): "dataOutput",
    ("DATA_STORE", None, None, None): "dataStore",
}
EDGE_SEMANTIC_TYPES = {
    "SEQUENCE": "sequenceFlow",
    "MESSAGE": "messageFlow",
    "ASSOCIATION": "association",
}
NAME_KEYS = {
    "startEvent": "eventName",
    "intermediateEvent": "eventName",
    "endEvent": "eventName",
    "transaction": "transactionName",
    "exclusiveGateway": "decisionName",
    "inclusiveGateway": "decisionName",
    "parallelGateway": "gatewayName",
    "complexGateway": "gatewayName",
    "dataObject": "dataName",
    "dataInput": "dataName",
    "dataOutput": "dataName",
    "dataStore": "dataName",
    "sequenceFlow": "flowName",
    "messageFlow": "messageName",
    "association": "associationName",
}

FIELD_KINDS: dict[str, dict[str, str]] = {
    "startEvent": {
        "eventName": "text", "triggerType": "text", "triggerSource": "text",
        "startCondition": "text", "inputDataRefs": "list", "initiator": "text",
        "frequency": "text", "preCheckRules": "list",
    },
    "intermediateEvent": {
        "eventName": "text", "catchOrThrow": "text", "eventDefinition": "text",
        "interrupting": "bool", "timeout": "text", "messageName": "text",
        "errorCode": "text", "escalationCode": "text", "businessMeaning": "text",
    },
    "endEvent": {
        "eventName": "text", "resultType": "text", "finalBusinessState": "text",
        "outputDataRefs": "list", "notifyTargets": "list", "auditRequired": "bool",
        "rollbackRequired": "bool",
    },
    "transaction": {
        "transactionName": "text", "transactionType": "text",
        "successCriteria": "list", "cancelTriggers": "list",
        "compensationPolicy": "text", "compensationOrder": "text",
        "consistencyLevel": "text", "timeout": "text", "isolationNote": "text",
        "compensationTasks": "list", "partialSuccessPolicy": "text",
        "auditRequired": "bool",
    },
    "exclusiveGateway": {
        "decisionName": "text", "decisionVariable": "text", "branches": "objects",
        "defaultFlowId": "text", "conditionExpressionType": "text",
        "mutuallyExclusive": "bool", "coverageRequired": "bool",
    },
    "inclusiveGateway": {
        "decisionName": "text", "branchConditions": "objects",
        "allowMultipleBranches": "bool", "mergePolicy": "text",
        "minSelectedBranches": "int", "coverageRequired": "bool",
    },
    "parallelGateway": {
        "gatewayName": "text", "parallelMode": "text", "waitForAll": "bool",
        "expectedBranches": "list", "partialFailurePolicy": "text",
        "timeout": "text", "concurrencyLimit": "int",
    },
    "complexGateway": {
        "gatewayName": "text", "activationCondition": "text",
        "completionCondition": "text", "requiredCount": "int", "totalCount": "int",
        "customRule": "text", "explanation": "text",
    },
    "dataObject": {
        "dataName": "text", "entityName": "text", "schemaRef": "text",
        "lifecycleState": "text", "ownerActivityRef": "text",
        "readByRefs": "list", "writeByRefs": "list",
    },
    "dataInput": {
        "dataName": "text", "sourceType": "text", "sourceRef": "text",
        "required": "bool", "validationRules": "list", "exampleValue": "text",
        "sensitiveLevel": "text", "defaultValue": "text",
    },
    "dataOutput": {
        "dataName": "text", "targetType": "text", "targetRef": "text",
        "outputContract": "text", "transformRule": "text",
        "successOutput": "text", "failureOutput": "text",
    },
    "dataStore": {
        "dataName": "text", "storeType": "text", "systemRef": "text",
        "accessMode": "text", "consistencyLevel": "text",
        "retentionPolicy": "text", "privacyLevel": "text",
    },
    "sequenceFlow": {
        "flowName": "text", "flowKind": "text", "conditionText": "text",
        "conditionExpression": "text", "conditionExpressionType": "text",
        "priority": "int", "isDefault": "bool", "businessRuleRefs": "list",
        "testScenarioType": "text", "expectedResult": "text",
    },
    "messageFlow": {
        "messageName": "text", "businessMeaning": "text", "senderRef": "text",
        "receiverRef": "text", "payloadDataRefs": "list", "deliveryMode": "text",
        "timeout": "text", "testScenarioType": "text", "expectedResult": "text",
    },
    "association": {
        "associationName": "text", "businessMeaning": "text", "direction": "text",
        "dataRole": "text", "testScenarioType": "text", "expectedResult": "text",
    },
}

DEFAULT_VALUES: dict[str, dict[str, Any]] = {
    "startEvent": {"triggerType": "manual"},
    "intermediateEvent": {
        "catchOrThrow": "catch", "eventDefinition": "message", "interrupting": False,
    },
    "endEvent": {"resultType": "success", "auditRequired": False, "rollbackRequired": False},
    "transaction": {
        "transactionType": "business", "compensationOrder": "reverseOrder",
        "consistencyLevel": "eventual", "auditRequired": False,
    },
    "exclusiveGateway": {
        "conditionExpressionType": "naturalLanguage", "mutuallyExclusive": True,
        "coverageRequired": True,
    },
    "inclusiveGateway": {
        "allowMultipleBranches": True, "minSelectedBranches": 1,
        "coverageRequired": True,
    },
    "parallelGateway": {"parallelMode": "forkJoin", "waitForAll": True},
    "dataInput": {"sourceType": "user", "required": False, "sensitiveLevel": "normal"},
    "dataOutput": {"targetType": "ui"},
    "dataStore": {
        "storeType": "database", "accessMode": "readWrite",
        "consistencyLevel": "eventual", "privacyLevel": "internal",
    },
    "sequenceFlow": {
        "flowKind": "normal", "conditionExpressionType": "naturalLanguage",
        "isDefault": False, "testScenarioType": "normal",
    },
    "messageFlow": {"deliveryMode": "async", "testScenarioType": "normal"},
    "association": {
        "direction": "none", "dataRole": "reference", "testScenarioType": "normal",
    },
}

ENUM_VALUES: dict[str, dict[str, set[str]]] = {
    "startEvent": {"triggerType": {"manual", "message", "timer", "signal", "condition"}},
    "intermediateEvent": {
        "catchOrThrow": {"catch", "throw"},
        "eventDefinition": {"message", "timer", "error", "signal", "compensation", "escalation"},
    },
    "endEvent": {
        "resultType": {"success", "failure", "cancel", "terminate", "error", "compensation"},
    },
    "transaction": {
        "transactionType": {"technical", "business", "saga"},
        "compensationOrder": {"reverseOrder", "forwardOrder", "custom"},
        "consistencyLevel": {"strong", "eventual"},
    },
    "exclusiveGateway": {
        "conditionExpressionType": {"naturalLanguage", "feel", "javascript", "sql"},
    },
    "parallelGateway": {"parallelMode": {"fork", "join", "forkJoin"}},
    "dataInput": {
        "sourceType": {"user", "system", "api", "message", "file"},
        "sensitiveLevel": {"normal", "internal", "confidential"},
    },
    "dataOutput": {"targetType": {"api", "database", "message", "file", "ui"}},
    "dataStore": {
        "storeType": {"database", "cache", "file", "mq", "externalSystem"},
        "accessMode": {"read", "write", "readWrite"},
        "consistencyLevel": {"strong", "eventual"},
        "privacyLevel": {"normal", "internal", "confidential"},
    },
    "sequenceFlow": {
        "flowKind": {"normal", "conditional", "default", "exception", "compensation"},
        "conditionExpressionType": {"naturalLanguage", "feel", "javascript", "sql"},
        "testScenarioType": {"normal", "exception", "boundary", "compensation"},
    },
    "messageFlow": {
        "deliveryMode": {"sync", "async"},
        "testScenarioType": {"normal", "exception", "boundary", "compensation"},
    },
    "association": {
        "direction": {"none", "oneWay", "twoWay"},
        "dataRole": {"input", "output", "reference"},
        "testScenarioType": {"normal", "exception", "boundary", "compensation"},
    },
}

FIELD_LABELS = {
    "triggerType": "触发方式", "startCondition": "启动条件",
    "resultType": "结果类型", "finalBusinessState": "最终业务状态",
    "transactionType": "事务类型", "decisionVariable": "判断变量",
    "sourceType": "来源类型", "targetType": "目标类型",
    "storeType": "存储类型", "flowKind": "路径类型",
}


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _items(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _text_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [item.strip() for item in value.splitlines() if item.strip()]
    return [_text(item) for item in _items(value) if _text(item)]


def _objects(value: Any) -> list[dict[str, Any]]:
    return [dict(item) for item in _items(value) if isinstance(item, Mapping)]


def _profile_value(source: Mapping[str, Any], snake: str, camel: str) -> str | None:
    value = _text(source.get(snake) or source.get(camel))
    return value or None


def node_semantic_type(node: Mapping[str, Any]) -> str | None:
    if _profile_value(node, "bpmn_element_type", "bpmnElementType") == "TASK":
        return None
    key = (
        _profile_value(node, "bpmn_element_type", "bpmnElementType"),
        _profile_value(node, "bpmn_event_kind", "bpmnEventKind"),
        _profile_value(node, "bpmn_gateway_type", "bpmnGatewayType"),
        _profile_value(node, "bpmn_subprocess_kind", "bpmnSubProcessKind"),
    )
    return NODE_SEMANTIC_TYPES.get(key)


def edge_semantic_type(edge: Mapping[str, Any]) -> str | None:
    profile = (
        _profile_value(edge, "bpmn_flow_type", "bpmnFlowType")
        or _profile_value(edge, "edge_type", "edgeType")
        or ""
    )
    return EDGE_SEMANTIC_TYPES.get(profile)


def bpmn_semantic_payload(
    value: Any,
    semantic_type: str | None,
    fallback_name: str | None = None,
) -> dict[str, Any]:
    if not semantic_type or semantic_type not in FIELD_KINDS:
        return {}
    source = value if isinstance(value, Mapping) else {}
    result: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "semanticType": semantic_type,
    }
    defaults = DEFAULT_VALUES.get(semantic_type, {})
    for key, kind in FIELD_KINDS[semantic_type].items():
        raw = source.get(key)
        if kind == "text":
            text = _text(raw) or _text(defaults.get(key))
            allowed = ENUM_VALUES.get(semantic_type, {}).get(key)
            result[key] = text if not allowed or text in allowed else _text(defaults.get(key))
        elif kind == "list":
            result[key] = _text_list(raw)
        elif kind == "objects":
            result[key] = [
                {
                    "flowId": _text(item.get("flowId")),
                    "label": _text(item.get("label")),
                    "condition": _text(item.get("condition")),
                }
                for item in _objects(raw)
            ]
        elif kind == "bool":
            result[key] = raw if isinstance(raw, bool) else bool(defaults.get(key, False))
        elif kind == "int":
            try:
                result[key] = int(raw) if raw not in (None, "") else defaults.get(key)
            except (TypeError, ValueError):
                result[key] = defaults.get(key)
    name_key = NAME_KEYS[semantic_type]
    if not _text(result.get(name_key)):
        result[name_key] = _text(fallback_name)
    return result


def semantic_display_name(payload: Mapping[str, Any], fallback: str | None = None) -> str:
    name_key = NAME_KEYS.get(_text(payload.get("semanticType")))
    value = _text(payload.get(name_key)) if name_key else ""
    return value or _text(fallback)


def bpmn_semantic_quality_issues(
    element: Mapping[str, Any],
    payload: Mapping[str, Any],
    target: str,
) -> list[dict[str, Any]]:
    semantic_type = node_semantic_type(element) if target == "NODE" else edge_semantic_type(element)
    if not semantic_type:
        return []
    key = _text(element.get("node_key") or element.get("edge_key"))
    normalized = bpmn_semantic_payload(
        payload,
        semantic_type,
        _text(element.get("title") or element.get("label")),
    )
    issues: list[dict[str, Any]] = []

    def add(code: str, message: str) -> None:
        issues.append({
            "targetType": target,
            "targetKey": key,
            "severity": "warning",
            "code": code,
            "message": message,
        })

    if not semantic_display_name(normalized):
        add("BPMN_SEMANTIC_MISSING_NAME", "元素缺少业务名称。")
    required = {
        "startEvent": ("triggerType", "startCondition"),
        "endEvent": ("resultType", "finalBusinessState"),
        "transaction": ("transactionType",),
        "exclusiveGateway": ("decisionVariable",),
        "dataInput": ("sourceType",),
        "dataOutput": ("targetType",),
        "dataStore": ("storeType",),
        "sequenceFlow": ("flowKind",),
    }.get(semantic_type, ())
    for field in required:
        if not normalized.get(field):
            add("BPMN_SEMANTIC_MISSING_FIELD", f"元素缺少必填业务字段：{FIELD_LABELS.get(field, field)}。")
    if (
        semantic_type == "transaction"
        and normalized.get("transactionType") == "saga"
        and (
            not normalized.get("cancelTriggers")
            or not normalized.get("compensationPolicy")
            or not normalized.get("compensationTasks")
        )
    ):
        add("BPMN_SEMANTIC_SAGA_MISSING_COMPENSATION", "Saga 事务缺少取消条件或补偿定义。")
    if semantic_type == "complexGateway":
        required_count = normalized.get("requiredCount")
        total_count = normalized.get("totalCount")
        if required_count and total_count and required_count > total_count:
            add("BPMN_SEMANTIC_INVALID_COUNT", "复杂网关要求完成数量不能大于总分支数。")
    if semantic_type in {"exclusiveGateway", "inclusiveGateway"}:
        branch_key = "branches" if semantic_type == "exclusiveGateway" else "branchConditions"
        flow_ids = [
            _text(branch.get("flowId"))
            for branch in normalized.get(branch_key, [])
            if _text(branch.get("flowId"))
        ]
        if len(flow_ids) != len(set(flow_ids)):
            add("BPMN_SEMANTIC_DUPLICATE_BRANCH", "网关存在重复的分支连线。")
        if (
            semantic_type == "exclusiveGateway"
            and normalized.get("defaultFlowId")
            and normalized["defaultFlowId"] not in flow_ids
        ):
            add("BPMN_SEMANTIC_INVALID_DEFAULT_FLOW", "默认路径不在已配置分支中。")
    return issues


def is_data_element(element: Mapping[str, Any]) -> bool:
    return _profile_value(element, "bpmn_element_type", "bpmnElementType") in DATA_ELEMENT_TYPES
