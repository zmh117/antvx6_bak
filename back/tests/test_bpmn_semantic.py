import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.application.agent_context_service import _step_context_item, build_business_flow_context
from app.domain.business_flow.bpmn_semantic import (
    FIELD_KINDS,
    bpmn_semantic_payload,
    bpmn_semantic_quality_issues,
    edge_semantic_type,
    is_data_element,
    node_semantic_type,
    semantic_display_name,
)
from app.interfaces.http.routers.business_flow.routes import _remap_component_semantic_refs


class BpmnSemanticTest(unittest.TestCase):
    def test_cleanup_migration_drops_only_retired_bpmn_columns(self) -> None:
        migration = (
            Path(__file__).resolve().parents[1]
            / "migrations"
            / "019_bpmn_schema_cleanup.sql"
        ).read_text(encoding="utf-8")
        for retired_column in {
            "description", "actor", "business_rule", "input_summary",
            "output_summary", "semantic_profile_key", "process_container_json",
            "bpmn_call_activity_ref", "condition_text", "data_contract_json",
        }:
            self.assertIn(f"DROP COLUMN IF EXISTS {retired_column}".upper(), migration.upper())
        for retained_column in {"title", "label", "properties_json", "task_ui_json", "bpmn_semantic_json"}:
            self.assertNotIn(f"DROP COLUMN IF EXISTS {retained_column}".upper(), migration.upper())

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
        self.assertNotIn("actor", item)
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

    def test_er_binding_boundary_covers_every_non_task_profile(self) -> None:
        allowed = {"DATA_OBJECT", "DATA_INPUT", "DATA_OUTPUT", "DATA_STORE"}
        for element_type in {
            "EVENT", "SUB_PROCESS", "GATEWAY", "DATA_OBJECT",
            "DATA_INPUT", "DATA_OUTPUT", "DATA_STORE", "TASK",
        }:
            self.assertEqual(
                is_data_element({"bpmn_element_type": element_type}),
                element_type in allowed,
            )

    def test_component_reference_remap_updates_gateway_and_data_references(self) -> None:
        remapped = _remap_component_semantic_refs(
            {
                "defaultFlowId": "edge-1",
                "branches": [{"flowId": "edge-1", "label": "通过", "condition": "ok"}],
                "ownerActivityRef": "task-1",
                "readByRefs": ["task-1"],
            },
            {"task-1": "lane-task-1"},
            {"edge-1": "lane-edge-1"},
        )
        self.assertEqual(remapped["defaultFlowId"], "lane-edge-1")
        self.assertEqual(remapped["branches"][0]["flowId"], "lane-edge-1")
        self.assertEqual(remapped["ownerActivityRef"], "lane-task-1")
        self.assertEqual(remapped["readByRefs"], ["lane-task-1"])

    @patch("app.application.agent_context_service.repo.fetch_swimlane_flow_er_refs")
    @patch("app.application.agent_context_service.repo.fetch_swimlane_flow_edges")
    @patch("app.application.agent_context_service.repo.fetch_swimlane_flow_nodes")
    @patch("app.application.agent_context_service.repo.fetch_swimlane_business_flow_rows")
    def test_agent_context_projects_structured_semantics_and_filters_legacy_fields(
        self,
        fetch_flows,
        fetch_nodes,
        fetch_edges,
        fetch_refs,
    ) -> None:
        flow_id = uuid4()
        fetch_flows.return_value = [{"id": flow_id, "code": "ORDER", "name": "订单流程", "description": None}]
        fetch_nodes.return_value = [
            {
                "node_key": "start", "node_type": "START", "bpmn_element_type": "EVENT",
                "bpmn_event_kind": "START", "title": "旧开始", "actor": "旧角色",
                "bpmn_semantic_json": {
                    "eventName": "订单开始", "triggerType": "message",
                    "startCondition": "收到订单消息",
                },
            },
            {
                "node_key": "gateway", "node_type": "GATEWAY", "bpmn_element_type": "GATEWAY",
                "bpmn_gateway_type": "EXCLUSIVE", "title": "旧判断",
                "bpmn_semantic_json": {
                    "decisionName": "库存判断", "decisionVariable": "stock",
                    "branches": [{"flowId": "flow-ok", "label": "有库存", "condition": "stock > 0"}],
                    "defaultFlowId": "flow-ok",
                },
            },
            {
                "node_key": "order-data", "node_type": "DATA_OBJECT",
                "bpmn_element_type": "DATA_OBJECT", "title": "旧数据",
                "bpmn_semantic_json": {"dataName": "订单数据", "entityName": "订单"},
            },
        ]
        fetch_edges.return_value = [
            {
                "edge_key": "flow-ok", "edge_type": "SEQUENCE", "bpmn_flow_type": "SEQUENCE",
                "source_node_key": "gateway", "target_node_key": "order-data", "label": "旧路径",
                "bpmn_semantic_json": {
                    "flowName": "库存充足", "flowKind": "conditional",
                    "conditionText": "库存大于零", "testScenarioType": "normal",
                },
            },
        ]
        fetch_refs.return_value = [
            {"node_key": "start", "er_table_key": "illegal"},
            {"node_key": "order-data", "er_table_key": "orders"},
        ]

        context = build_business_flow_context(object(), uuid4())
        flow = context["businessFlows"][0]
        self.assertEqual(flow["steps"][0]["title"], "订单开始")
        self.assertNotIn("actor", flow["steps"][0])
        self.assertEqual(flow["steps"][1]["bpmnSemantic"]["defaultFlowId"], "flow-ok")
        self.assertEqual(flow["edges"][0]["bpmnSemantic"]["conditionText"], "库存大于零")
        self.assertEqual(flow["erRefs"], [{"node_key": "order-data", "er_table_key": "orders"}])


if __name__ == "__main__":
    unittest.main()
