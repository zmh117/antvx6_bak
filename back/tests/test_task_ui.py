import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.application.agent_context_service import _step_context_item
from app.domain.business_flow.semantic_profile import business_flow_quality_issues
from app.domain.business_flow.task_ui import task_ui_payload, task_ui_quality_issues


class TaskUiPayloadTest(unittest.TestCase):
    def test_payload_normalizes_legacy_route_and_ignores_structured_locator(self) -> None:
        payload = task_ui_payload(
            {
                "taskType": "manualTask",
                "page": {"pageName": "工单创建页", "routePattern": "/mes/work-orders/new"},
                "uiSteps": [
                    {
                        "stepNo": 1,
                        "elementType": "Select",
                        "actionType": "select",
                        "elementName": "生产线",
                        "elementLocationHint": "通过字段标题识别",
                        "locator": {"strategy": "testId", "value": "line-select"},
                        "options": [{"label": "一号线", "value": "LINE_1"}],
                        "expectedResult": "生产线已选择",
                    }
                ],
            },
            fallback_task_name="提交工单",
        )

        self.assertEqual(payload["taskName"], "提交工单")
        self.assertEqual(payload["taskType"], "manualTask")
        self.assertEqual(payload["page"]["urlPattern"], "/mes/work-orders/new")
        self.assertEqual(payload["uiSteps"][0]["elementLocationHint"], "通过字段标题识别")
        self.assertNotIn("locator", payload["uiSteps"][0])
        self.assertEqual(payload["uiSteps"][0]["options"][0]["value"], "LINE_1")

    def test_quality_issues_cover_required_and_element_specific_gaps(self) -> None:
        issues = task_ui_quality_issues(
            {
                "node_key": "task-1",
                "bpmn_element_type": "TASK",
                "task_ui_json": {
                    "page": {},
                    "uiSteps": [
                        {"elementType": "Select", "actionType": "click", "elementName": "目的地"},
                        {"elementType": "DataTable", "actionType": "assertCell", "elementName": "订单列表"},
                        {"elementType": "ContextMenu", "actionType": "selectMenuItem", "elementName": "订单行菜单"},
                    ],
                },
            }
        )
        codes = {issue["code"] for issue in issues}

        self.assertIn("TASK_UI_MISSING_TASK_NAME", codes)
        self.assertIn("TASK_UI_MISSING_PAGE", codes)
        self.assertIn("TASK_UI_ACTION_MISMATCH", codes)
        self.assertIn("TASK_UI_SELECT_MISSING_OPTIONS", codes)
        self.assertIn("TASK_UI_TABLE_MISSING_ASSERTION", codes)
        self.assertIn("TASK_UI_CONTEXT_MENU_MISSING_ITEMS", codes)

    def test_agent_step_context_uses_task_ui_instead_of_legacy_task_fields(self) -> None:
        item = _step_context_item(
            {
                "node_key": "task-1",
                "title": "旧标题",
                "node_type": "FLOW_NODE",
                "bpmn_element_type": "TASK",
                "actor": "旧角色",
                "business_rule": "旧规则",
                "input_summary": "旧输入",
                "output_summary": "旧输出",
                "task_ui_json": {
                    "taskName": "提交工单",
                    "actor": "计划员",
                    "page": {"pageName": "工单创建页"},
                    "uiSteps": [
                        {
                            "elementType": "Button",
                            "actionType": "click",
                            "elementName": "提交",
                            "expectedResult": "提交成功",
                        }
                    ],
                },
            },
            {"task-1": [{"er_table_key": "work_order", "er_column_key": "id"}]},
        )

        self.assertEqual(item["title"], "提交工单")
        self.assertIsNone(item["actor"])
        self.assertIsNone(item["businessRule"])
        self.assertIsNone(item["inputSummary"])
        self.assertIsNone(item["outputSummary"])
        self.assertEqual(item["erRefs"], [])
        self.assertEqual(item["taskUi"]["actor"], "计划员")
        self.assertEqual(item["taskUi"]["uiSteps"][0]["elementType"], "Button")

    def test_business_flow_quality_no_longer_requires_task_er_binding(self) -> None:
        issues = business_flow_quality_issues(
            [
                {
                    "node_key": "task-1",
                    "bpmn_element_type": "TASK",
                    "semantic_profile_key": "mes-manufacturing-node",
                    "semantic_payload_json": {"operationType": "RELEASE"},
                    "task_ui_json": {
                        "taskName": "提交工单",
                        "page": {"pageName": "工单创建页"},
                        "uiSteps": [
                            {
                                "elementType": "Button",
                                "actionType": "click",
                                "elementName": "提交",
                                "expectedResult": "提交成功",
                            }
                        ],
                    },
                }
            ],
            [],
            {},
        )

        self.assertNotIn("MISSING_ER_REF", {issue["code"] for issue in issues})


if __name__ == "__main__":
    unittest.main()
