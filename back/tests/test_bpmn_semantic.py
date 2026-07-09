import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.application.agent_context_service import _step_context_item
from app.domain.business_flow.bpmn_semantic import (
    FIELD_KINDS,
    bpmn_semantic_payload,
    bpmn_semantic_quality_issues,
    edge_semantic_type,
    is_data_element,
    node_semantic_type,
    semantic_display_name,
)


class BpmnSemanticTest(unittest.TestCase):
    def test_maps_current_non_task_node_and_edge_profiles(self) -> None:
        self.assertEqual(node_semantic_type({"bpmn_element_type": "EVENT", "bpmn_event_kind": "START"}), "startEvent")
        self.assertEqual(node_semantic_type({"bpmn_element_type": "SUB_PROCESS", "bpmn_subprocess_kind": "TRANSACTION"}), "transaction")
        self.assertEqual(node_semantic_type({"bpmn_element_type": "GATEWAY", "bpmn_gateway_type": "COMPLEX"}), "complexGateway")
        self.assertEqual(node_semantic_type({"bpmn_element_type": "TASK"}), None)
        self.assertEqual(edge_semantic_type({"bpmn_flow_type": "MESSAGE"}), "messageFlow")
        self.assertTrue(is_data_element({"bpmn_element_type": "DATA_OBJECT"}))

    def test_normalizes_fields_and_uses_title_as_name_fallback(self) -> None:
        payload = bpmn_semantic_payload(
            {
                "semanticType": "wrong",
                "triggerType": "message",
                "startCondition": "收到订单消息",
                "unknownField": "discard",
            },
            "startEvent",
            "订单开始",
        )
        self.assertEqual(payload["schemaVersion"], 1)
        self.assertEqual(payload["semanticType"], "startEvent")
        self.assertEqual(semantic_display_name(payload), "订单开始")
        self.assertNotIn("unknownField", payload)

    def test_agent_context_ignores_legacy_fields_and_non_data_er_refs(self) -> None:
        item = _step_context_item(
            {
                "node_key": "start-1",
                "node_type": "START",
                "bpmn_element_type": "EVENT",
                "bpmn_event_kind": "START",
                "title": "旧标题",
                "actor": "旧角色",
                "business_rule": "旧规则",
                "input_summary": "旧输入",
                "output_summary": "旧输出",
                "bpmn_semantic_json": {
                    "semanticType": "startEvent",
                    "eventName": "订单开始",
                    "triggerType": "message",
                    "startCondition": "收到订单消息",
                },
            },
            {"start-1": [{"er_table_key": "orders"}]},
        )
        self.assertEqual(item["title"], "订单开始")
        self.assertEqual(item["bpmnSemantic"]["triggerType"], "message")
        self.assertIsNone(item["actor"])
        self.assertEqual(item["erRefs"], [])

    def test_quality_reports_incomplete_saga(self) -> None:
        node = {
            "node_key": "tx-1",
            "bpmn_element_type": "SUB_PROCESS",
            "bpmn_subprocess_kind": "TRANSACTION",
            "title": "预订事务",
        }
        issues = bpmn_semantic_quality_issues(
            node,
            {"transactionType": "saga"},
            "NODE",
        )
        self.assertIn(
            "BPMN_SEMANTIC_SAGA_MISSING_COMPENSATION",
            {issue["code"] for issue in issues},
        )

    def test_all_fifteen_models_are_normalized_and_isolated(self) -> None:
        self.assertEqual(len(FIELD_KINDS), 15)
        for semantic_type in FIELD_KINDS:
            payload = bpmn_semantic_payload(
                {"unknownField": "discard"},
                semantic_type,
                "默认名称",
            )
            self.assertEqual(payload["semanticType"], semantic_type)
            self.assertEqual(payload["schemaVersion"], 1)
            self.assertNotIn("unknownField", payload)
            self.assertEqual(semantic_display_name(payload), "默认名称")

    def test_invalid_enum_and_gateway_references_are_normalized_or_reported(self) -> None:
        start = bpmn_semantic_payload(
            {"triggerType": "INVALID"},
            "startEvent",
            "开始",
        )
        self.assertEqual(start["triggerType"], "manual")
        gateway = {
            "node_key": "gateway-1",
            "bpmn_element_type": "GATEWAY",
            "bpmn_gateway_type": "EXCLUSIVE",
            "title": "判断",
        }
        issues = bpmn_semantic_quality_issues(
            gateway,
            {
                "branches": [
                    {"flowId": "flow-1", "label": "成功", "condition": "ok"},
                    {"flowId": "flow-1", "label": "重复", "condition": "again"},
                ],
                "defaultFlowId": "flow-2",
            },
            "NODE",
        )
        codes = {issue["code"] for issue in issues}
        self.assertIn("BPMN_SEMANTIC_DUPLICATE_BRANCH", codes)
        self.assertIn("BPMN_SEMANTIC_INVALID_DEFAULT_FLOW", codes)


if __name__ == "__main__":
    unittest.main()
