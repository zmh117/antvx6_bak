import re
import sys
import unittest
import ast
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import BASELINE_MIGRATION
from app.interfaces.http.routers.business_flow.routes import (
    _reject_retired_bpmn_fields,
)
from fastapi import HTTPException


class SchemaCleanupTest(unittest.TestCase):
    def test_retired_client_fields_are_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            _reject_retired_bpmn_fields(
                {"semanticProfileKey": "legacy", "title": "任务"},
                "node-1",
            )
        self.assertEqual(raised.exception.status_code, 400)

    def test_baseline_migration_is_single_source_of_truth(self) -> None:
        migrations_root = Path(__file__).resolve().parents[1] / "migrations"
        self.assertEqual(BASELINE_MIGRATION, "001_baseline.sql")
        baseline = migrations_root / BASELINE_MIGRATION
        self.assertTrue(baseline.is_file())
        active = sorted(p.name for p in migrations_root.glob("0*.sql"))
        self.assertEqual(active, [BASELINE_MIGRATION])

    def test_baseline_covers_final_tables_and_comments(self) -> None:
        sql = (
            Path(__file__).resolve().parents[1]
            / "migrations"
            / BASELINE_MIGRATION
        ).read_text(encoding="utf-8")
        self.assertIn("CREATE TABLE public.business_flow_node", sql)
        self.assertIn("task_ui_json", sql)
        self.assertIn("bpmn_semantic_json", sql)
        self.assertIn("COMMENT ON TABLE", sql)
        self.assertIn("COMMENT ON COLUMN", sql)
        self.assertRegex(sql, re.compile(r"[\u4e00-\u9fff]"))
        self.assertNotIn("business_semantic_profile", sql)
        for retired_column in {
            "semantic_profile_key",
            "process_container_json",
            "bpmn_call_activity_ref",
            "condition_text",
            "data_contract_json",
        }:
            self.assertNotIn(retired_column, sql)

    def test_runtime_code_does_not_reference_dropped_storage_fields(self) -> None:
        app_root = Path(__file__).resolve().parents[1] / "app"
        forbidden = {
            "semantic_profile_key",
            "semantic_payload_json",
            "process_container_json",
            "container_node_key",
            "bpmn_call_activity_ref",
            "bpmn_message_name",
            "bpmn_condition_expression",
            "condition_text",
            "data_contract_json",
            "input_summary",
            "output_summary",
            "business_rule",
        }
        offenders = []
        for path in app_root.rglob("*.py"):
            if path.name == "database.py":
                continue
            text = path.read_text(encoding="utf-8")
            if path.name == "routes.py":
                text = re.sub(
                    r"RETIRED_BPMN_FIELDS = \{.*?\n\}\n",
                    "",
                    text,
                    flags=re.DOTALL,
                )
            for token in forbidden:
                if token in text:
                    offenders.append(f"{path.relative_to(app_root)}:{token}")
        front_root = app_root.parents[1] / "front" / "src"
        frontend_forbidden = {
            "semanticProfileKey",
            "semanticProfileVersion",
            "semanticPayloadJson",
            "processContainerJson",
            "containerNodeKey",
            "bpmnCallActivityRef",
            "bpmnMessageName",
            "bpmnConditionExpression",
            "dataContractJson",
            "inputSummary",
            "outputSummary",
        }
        for path in front_root.rglob("*"):
            if path.suffix not in {".ts", ".tsx"}:
                continue
            text = path.read_text(encoding="utf-8")
            for token in frontend_forbidden:
                if token in text:
                    offenders.append(f"{path.relative_to(front_root)}:{token}")
        self.assertEqual(offenders, [])

    def test_literal_sql_parameter_counts_match(self) -> None:
        back_root = Path(__file__).resolve().parents[1]
        paths = (
            back_root / "app/interfaces/http/routers/business_flow/routes.py",
            back_root / "app/interfaces/http/routers/swimlane_components.py",
        )
        mismatches = []
        for path in paths:
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for call in ast.walk(tree):
                if not (
                    isinstance(call, ast.Call)
                    and isinstance(call.func, ast.Attribute)
                    and call.func.attr == "execute"
                    and len(call.args) > 1
                    and isinstance(call.args[0], ast.Constant)
                    and isinstance(call.args[0].value, str)
                    and isinstance(call.args[1], (ast.Tuple, ast.List))
                ):
                    continue
                placeholders = call.args[0].value.count("%s")
                arguments = len(call.args[1].elts)
                if placeholders != arguments:
                    mismatches.append(
                        f"{path.name}:{call.lineno}:{placeholders}!={arguments}"
                    )
        self.assertEqual(mismatches, [])


if __name__ == "__main__":
    unittest.main()
