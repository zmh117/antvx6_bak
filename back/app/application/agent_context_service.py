"""Agent 上下文组装应用服务。

将 ER 检索文档、逻辑关联、以及业务图（legacy er_business_flow 与新泳道 business_flow）
统一组装为 Agent 写用例所需的上下文文本与文档列表。
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import psycopg

from app.domain.business_flow.bpmn_semantic import (
    bpmn_semantic_payload,
    bpmn_semantic_quality_issues,
    edge_semantic_type,
    is_data_element,
    node_semantic_type,
    semantic_display_name,
)
from app.domain.business_flow.task_ui import task_ui_payload, task_ui_quality_issues
from app.infrastructure.db.repositories import agent_context_repository as repo
from app.services.agent_labels import match_operator_label


def normalize_agent_query(query: str | None) -> str | None:
    if not query:
        return None
    q = query.strip()
    if len(q) >= 2 and q[0] == q[-1] and q[0] in "'\"":
        q = q[1:-1].strip()
    return q or None


def merge_documents(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for doc in docs:
        doc_type = doc.get("doc_type")
        if doc_type == "business_flow_binding":
            key = f"{doc.get('ref_flow_key')}:{doc.get('ref_step_key')}:{doc.get('title')}"
        elif doc_type == "business_flow":
            key = doc.get("ref_flow_key") or doc.get("title") or ""
        elif doc.get("ref_relation_key"):
            key = doc["ref_relation_key"]
        elif doc.get("ref_table_key") and doc.get("ref_column_key"):
            key = f"{doc['ref_table_key']}.{doc['ref_column_key']}"
        else:
            key = doc.get("title") or ""
        dedupe = f"{doc_type}:{key}"
        if dedupe in seen:
            continue
        seen.add(dedupe)
        merged.append(doc)
    return merged


def _json_summary(value: Any) -> str:
    if not value:
        return ""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def _bpmn_semantic_line(prefix: str, item: dict[str, Any], target: str) -> str:
    semantic_type = node_semantic_type(item) if target == "NODE" else edge_semantic_type(item)
    payload = bpmn_semantic_payload(
        item.get("bpmn_semantic_json"),
        semantic_type,
        item.get("title") or item.get("label"),
    )
    return f"  {prefix}：{_json_summary(payload)}" if payload else ""


def _task_ui_line(node: dict[str, Any]) -> str:
    payload = task_ui_payload(node.get("task_ui_json"), fallback_task_name=node.get("title"))
    if not payload:
        return ""
    return f"  Task UI：{_json_summary(payload)}"


def _is_task_node(node: dict[str, Any]) -> bool:
    return node.get("bpmn_element_type") == "TASK"


def _flow_paths(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> dict[str, list[Any]]:
    node_by_key = {node.get("node_key"): node for node in nodes if node.get("node_key")}
    outgoing: dict[str, list[dict[str, Any]]] = {}
    for edge in edges:
        source = edge.get("source_node_key")
        if source:
            outgoing.setdefault(source, []).append(edge)

    starts = [
        node["node_key"]
        for node in nodes
        if node.get("bpmn_event_kind") == "START" and node.get("node_key")
    ]
    if not starts and nodes:
        starts = [nodes[0]["node_key"]]

    happy_paths: list[list[str]] = []
    branch_paths: list[dict[str, Any]] = []
    exception_paths: list[dict[str, Any]] = []

    def walk(node_key: str, path: list[str], depth: int = 0) -> None:
        if depth > 30 or node_key in path:
            happy_paths.append(path + [node_key])
            return
        next_path = path + [node_key]
        next_edges = outgoing.get(node_key, [])
        if not next_edges:
            happy_paths.append(next_path)
            return
        normal_edges = [
            edge for edge in next_edges
            if edge.get("bpmn_sequence_flow_kind") not in {"EXCEPTION"}
        ]
        if len(next_edges) > 1:
            branch_paths.append(
                {
                    "fromStepKey": node_key,
                    "branches": [
                        {
                            "edgeKey": edge.get("edge_key"),
                            "toStepKey": edge.get("target_node_key"),
                            "condition": bpmn_semantic_payload(
                                edge.get("bpmn_semantic_json"),
                                edge_semantic_type(edge),
                                edge.get("label"),
                            ).get("conditionText"),
                        }
                        for edge in next_edges
                    ],
                }
            )
        for edge in next_edges:
            if edge.get("bpmn_sequence_flow_kind") == "EXCEPTION":
                exception_paths.append(
                    {
                        "fromStepKey": node_key,
                        "edgeKey": edge.get("edge_key"),
                        "toStepKey": edge.get("target_node_key"),
                        "exceptionType": bpmn_semantic_payload(
                            edge.get("bpmn_semantic_json"),
                            edge_semantic_type(edge),
                            edge.get("label"),
                        ).get("testScenarioType"),
                    }
                )
                continue
            target = edge.get("target_node_key")
            if target and target in node_by_key:
                walk(target, next_path, depth + 1)
        if not normal_edges:
            happy_paths.append(next_path)

    for start in starts[:5]:
        walk(start, [])
    return {
        "happyPaths": happy_paths[:20],
        "branchPaths": branch_paths[:50],
        "exceptionPaths": exception_paths[:50],
    }


def _step_context_item(
    node: dict[str, Any],
    refs_by_node_key: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    node_key = node.get("node_key") or ""
    is_task = _is_task_node(node)
    task_ui = task_ui_payload(node.get("task_ui_json"), fallback_task_name=node.get("title")) if is_task else {}
    bpmn_semantic = bpmn_semantic_payload(
        node.get("bpmn_semantic_json"),
        node_semantic_type(node),
        node.get("title"),
    )
    return {
        "stepKey": node.get("node_key"),
        "title": task_ui.get("taskName") if is_task else semantic_display_name(bpmn_semantic, node.get("title")),
        "nodeType": node.get("node_type"),
        "bpmn": {
            "elementType": node.get("bpmn_element_type"),
            "eventKind": node.get("bpmn_event_kind"),
            "taskType": node.get("bpmn_task_type"),
            "gatewayType": node.get("bpmn_gateway_type"),
            "subProcessKind": node.get("bpmn_subprocess_kind"),
        },
        "lane": node.get("lane_name"),
        "bpmnSemantic": bpmn_semantic,
        "erRefs": refs_by_node_key.get(str(node_key), []) if is_data_element(node) else [],
        "taskUi": task_ui,
    }


def enrich_relation_documents(
    cur: psycopg.Cursor, graph_id: UUID, docs: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    relation_keys = [
        str(doc["ref_relation_key"])
        for doc in docs
        if doc.get("doc_type") == "relation" and doc.get("ref_relation_key")
    ]
    full_docs = {
        doc["ref_relation_key"]: doc
        for doc in repo.fetch_relations_by_keys(cur, graph_id, relation_keys)
    }
    return [
        full_docs.get(doc.get("ref_relation_key"), doc)
        if doc.get("doc_type") == "relation"
        else doc
        for doc in docs
    ]


def _node_label(node: dict[str, Any]) -> str:
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    for key in ("label", "name", "title"):
        value = data.get(key) or node.get(key)
        if value:
            return str(value)
    return str(node.get("id") or node.get("key") or node.get("node_key") or "未命名步骤")


def legacy_flow_doc_from_row(row: dict[str, Any]) -> dict[str, Any]:
    flow_json = row.get("flow_json") or {}
    nodes = flow_json.get("nodes") or []
    edges = flow_json.get("edges") or []
    step_lines = [
        f"- {node.get('id') or node.get('key')}: {_node_label(node)}"
        for node in nodes
        if isinstance(node, dict)
    ]
    content = "\n".join(
        filter(
            None,
            [
                f"业务流程 {row['flow_key']}：{row['name']}",
                f"说明：{row.get('description') or ''}",
                f"步骤数：{len(nodes)}，连线数：{len(edges)}",
                "步骤：\n" + "\n".join(step_lines) if step_lines else "",
            ],
        )
    )
    return {
        "doc_type": "business_flow",
        "title": row["name"],
        "content": content,
        "ref_flow_key": row["flow_key"],
        "ref_table_key": None,
        "ref_column_key": None,
        "ref_relation_key": None,
    }


def legacy_binding_doc_from_row(flow: dict[str, Any], binding: dict[str, Any]) -> dict[str, Any]:
    target = binding.get("relation_key")
    if not target and binding.get("table_key"):
        target = binding["table_key"]
        if binding.get("column_key"):
            target = f"{target}.{binding['column_key']}"
    content = "\n".join(
        filter(
            None,
            [
                f"流程绑定 {flow['name']} / {binding['step_key']}",
                f"用途：{binding.get('usage_type') or 'read'}",
                f"目标：{target or ''}",
                f"说明：{binding.get('description') or ''}",
            ],
        )
    )
    return {
        "doc_type": "business_flow_binding",
        "title": f"{flow['name']}:{binding['step_key']}",
        "content": content,
        "ref_flow_key": flow["flow_key"],
        "ref_step_key": binding["step_key"],
        "ref_table_key": binding.get("table_key"),
        "ref_column_key": binding.get("column_key"),
        "ref_relation_key": binding.get("relation_key"),
        "usage_type": binding.get("usage_type") or "read",
    }


def swimlane_flow_doc_from_row(cur: psycopg.Cursor, row: dict[str, Any]) -> dict[str, Any]:
    flow_id = row["id"]
    nodes = repo.fetch_swimlane_flow_nodes(cur, flow_id)
    edges = repo.fetch_swimlane_flow_edges(cur, flow_id)
    step_lines = [
        "\n".join(
            filter(
                None,
                [
                    f"- {node['node_key']}: {semantic_display_name(bpmn_semantic_payload(node.get('bpmn_semantic_json'), node_semantic_type(node), node.get('title')), node.get('title'))} ({node['node_type']})",
                    f"  BPMN：{node.get('bpmn_element_type') or ''}"
                    + (
                        f"/{node.get('bpmn_event_kind') or node.get('bpmn_task_type') or node.get('bpmn_gateway_type')}"
                        if node.get("bpmn_event_kind") or node.get("bpmn_task_type") or node.get("bpmn_gateway_type")
                        else ""
                    ),
                    f"  泳道：{node.get('lane_name') or ''}" if node.get("lane_name") else "",
                    _bpmn_semantic_line("BPMN 业务语义", node, "NODE"),
                    _task_ui_line(node),
                ],
            )
        )
        for node in nodes
    ]
    edge_lines = [
        "\n".join(
            filter(
                None,
                [
                    f"- {edge['edge_key']}: {edge.get('label') or ''} ({edge.get('edge_type') or ''})",
                    f"  BPMN 连线：{edge.get('bpmn_flow_type') or ''}"
                    + (
                        f"/{edge.get('bpmn_sequence_flow_kind')}"
                        if edge.get("bpmn_sequence_flow_kind")
                        else ""
                    ),
                    _bpmn_semantic_line("BPMN 连线语义", edge, "EDGE"),
                ],
            )
        )
        for edge in edges
    ]
    content = "\n".join(
        filter(
            None,
            [
                f"泳道业务图 {row['code']}：{row['name']}",
                f"说明：{row.get('description') or ''}",
                f"步骤数：{len(nodes)}，连线数：{len(edges)}",
                "步骤：\n" + "\n".join(step_lines) if step_lines else "",
                "连线：\n" + "\n".join(edge_lines) if edge_lines else "",
            ],
        )
    )
    return {
        "doc_type": "business_flow",
        "title": row["name"],
        "content": content,
        "ref_flow_key": row["code"],
        "ref_flow_id": str(flow_id),
        "ref_table_key": None,
        "ref_column_key": None,
        "ref_relation_key": None,
    }


def swimlane_binding_doc_from_row(flow: dict[str, Any], ref: dict[str, Any]) -> dict[str, Any]:
    target = ref["er_table_key"]
    if ref.get("er_column_key"):
        target = f"{target}.{ref['er_column_key']}"
    content = "\n".join(
        filter(
            None,
            [
                f"泳道业务图绑定 {flow['name']} / {ref['node_key']}",
                f"用途：{ref.get('ref_type') or 'READ'}",
                f"目标：{target}",
                f"说明：{ref.get('description') or ''}",
            ],
        )
    )
    return {
        "doc_type": "business_flow_binding",
        "title": f"{flow['name']}:{ref['node_key']}",
        "content": content,
        "ref_flow_key": flow["code"],
        "ref_flow_id": str(flow["id"]),
        "ref_step_key": ref["node_key"],
        "ref_table_key": ref.get("er_table_key"),
        "ref_column_key": ref.get("er_column_key"),
        "ref_relation_key": None,
        "usage_type": (ref.get("ref_type") or "READ").lower(),
    }


def build_business_flow_context(cur: psycopg.Cursor, graph_id: UUID) -> dict[str, Any]:
    flows: list[dict[str, Any]] = []
    for flow in repo.fetch_swimlane_business_flow_rows(cur, graph_id):
        nodes = repo.fetch_swimlane_flow_nodes(cur, flow["id"])
        edges = repo.fetch_swimlane_flow_edges(cur, flow["id"])
        refs = repo.fetch_swimlane_flow_er_refs(cur, flow["id"])
        node_keys = {node.get("node_key") for node in nodes}
        data_node_keys = {node.get("node_key") for node in nodes if is_data_element(node)}
        refs = [
            ref
            for ref in refs
            if ref.get("node_key") in node_keys and ref.get("node_key") in data_node_keys
        ]
        refs_by_node_key: dict[str, list[dict[str, Any]]] = {}
        for ref in refs:
            refs_by_node_key.setdefault(ref["node_key"], []).append(ref)
        quality_issues = [
            issue
            for node in nodes
            for issue in task_ui_quality_issues(node)
        ]
        for node in nodes:
            quality_issues.extend(
                bpmn_semantic_quality_issues(
                    node,
                    node.get("bpmn_semantic_json") or {},
                    "NODE",
                )
            )
        for edge in edges:
            quality_issues.extend(
                bpmn_semantic_quality_issues(
                    edge,
                    edge.get("bpmn_semantic_json") or {},
                    "EDGE",
                )
            )
        step_context = [_step_context_item(node, refs_by_node_key) for node in nodes]
        edge_context = [
            {
                "edgeKey": edge.get("edge_key"),
                "label": edge.get("label"),
                "sourceStepKey": edge.get("source_node_key"),
                "targetStepKey": edge.get("target_node_key"),
                "edgeType": edge.get("edge_type"),
                "bpmn": {
                    "flowType": edge.get("bpmn_flow_type"),
                    "sequenceFlowKind": edge.get("bpmn_sequence_flow_kind"),
                },
                "bpmnSemantic": bpmn_semantic_payload(
                    edge.get("bpmn_semantic_json"),
                    edge_semantic_type(edge),
                    edge.get("label"),
                ),
            }
            for edge in edges
        ]
        paths = _flow_paths(nodes, edges)
        flows.append(
            {
                "flowId": str(flow["id"]),
                "code": flow["code"],
                "name": flow["name"],
                "description": flow.get("description"),
                "steps": step_context,
                "edges": edge_context,
                "erRefs": refs,
                "rules": [],
                "qualityIssues": quality_issues,
                **paths,
            }
        )
    return {"businessFlows": flows}


def fetch_business_flow_documents(
    cur: psycopg.Cursor,
    graph_id: UUID,
    query: str | None,
    er_docs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    related_tables = {doc.get("ref_table_key") for doc in er_docs if doc.get("ref_table_key")}
    related_columns = {
        (doc.get("ref_table_key"), doc.get("ref_column_key"))
        for doc in er_docs
        if doc.get("ref_table_key") and doc.get("ref_column_key")
    }
    related_relations = {
        doc.get("ref_relation_key") for doc in er_docs if doc.get("ref_relation_key")
    }
    q = query.casefold() if query else None
    docs: list[dict[str, Any]] = []

    legacy_flows = repo.fetch_legacy_business_flow_rows(cur, graph_id)
    legacy_bindings = repo.fetch_legacy_business_flow_bindings(
        cur, graph_id, [flow["flow_key"] for flow in legacy_flows]
    )
    for flow in legacy_flows:
        bindings = legacy_bindings.get(flow["flow_key"], [])
        searchable = json.dumps(
            {
                "flow_key": flow["flow_key"],
                "name": flow["name"],
                "description": flow.get("description"),
                "flow_json": flow.get("flow_json") or {},
                "bindings": bindings,
            },
            ensure_ascii=False,
            default=str,
        ).casefold()
        matched_by_query = bool(q and q in searchable)
        matched_by_ref = any(
            binding.get("relation_key") in related_relations
            or binding.get("table_key") in related_tables
            or (binding.get("table_key"), binding.get("column_key")) in related_columns
            for binding in bindings
        )
        if query and not matched_by_query and not matched_by_ref:
            continue
        docs.append(legacy_flow_doc_from_row(flow))
        docs.extend(legacy_binding_doc_from_row(flow, binding) for binding in bindings)

    for flow in repo.fetch_swimlane_business_flow_rows(cur, graph_id):
        refs = repo.fetch_swimlane_flow_er_refs(cur, flow["id"])
        nodes = repo.fetch_swimlane_flow_nodes(cur, flow["id"])
        edges = repo.fetch_swimlane_flow_edges(cur, flow["id"])
        node_keys = {node.get("node_key") for node in nodes}
        task_node_keys = {node.get("node_key") for node in nodes if _is_task_node(node)}
        refs = [
            ref
            for ref in refs
            if ref.get("node_key") in node_keys and ref.get("node_key") not in task_node_keys
        ]
        searchable = json.dumps(
            {
                "code": flow["code"],
                "name": flow["name"],
                "description": flow.get("description"),
                "nodes": nodes,
                "edges": edges,
                "refs": refs,
            },
            ensure_ascii=False,
            default=str,
        ).casefold()
        matched_by_query = bool(q and q in searchable)
        matched_by_ref = any(
            ref.get("er_table_key") in related_tables
            or (ref.get("er_table_key"), ref.get("er_column_key")) in related_columns
            for ref in refs
        )
        if query and not matched_by_query and not matched_by_ref:
            continue
        docs.append(swimlane_flow_doc_from_row(cur, flow))
        docs.extend(swimlane_binding_doc_from_row(flow, ref) for ref in refs)

    return docs


class AgentContextService:
    def build_agent_context(
        self, cur: psycopg.Cursor, graph_id: UUID, query: str | None = None
    ) -> dict[str, Any]:
        version = repo.fetch_graph_version(cur, graph_id)
        if version is None:
            raise ValueError("graph not found")

        q = normalize_agent_query(query)

        if q:
            pattern = f"%{q}%"
            docs = repo.search_index_documents(cur, graph_id, query_pattern=pattern, limit=80)
            expanded: list[dict[str, Any]] = []
            for doc in docs:
                if doc.get("doc_type") != "column":
                    continue
                table_key = doc.get("ref_table_key")
                column_key = doc.get("ref_column_key")
                if table_key and column_key:
                    expanded.extend(
                        repo.fetch_relations_for_column(cur, graph_id, table_key, column_key)
                    )
            docs = merge_documents(docs + expanded)
        else:
            docs = repo.search_index_documents(cur, graph_id, limit=120)

        docs = enrich_relation_documents(cur, graph_id, docs)
        docs = merge_documents(docs + fetch_business_flow_documents(cur, graph_id, q, docs))
        business_flow_context = build_business_flow_context(cur, graph_id)

        sections: list[str] = []
        rel_lines: list[str] = []
        flow_lines: list[str] = []
        for doc in docs:
            sections.append(f"### {doc.get('title')}\n{doc.get('content')}")
            if doc.get("doc_type") == "relation" and doc.get("ref_relation_key"):
                rk = doc["ref_relation_key"]
                flag = " [verified]" if doc.get("verified") else " [unverified]"
                rel_lines.append(
                    f"- {rk}: {doc.get('join_condition') or ''} "
                    f"({match_operator_label(doc.get('match_operator'))}, conf={doc.get('confidence')}){flag}"
                )
            if doc.get("doc_type") == "business_flow_binding" and doc.get("ref_flow_key"):
                target = doc.get("ref_relation_key")
                if not target and doc.get("ref_table_key"):
                    target = doc["ref_table_key"]
                    if doc.get("ref_column_key"):
                        target = f"{target}.{doc['ref_column_key']}"
                flow_lines.append(
                    f"- {doc['ref_flow_key']}/{doc.get('ref_step_key')}: "
                    f"{doc.get('usage_type') or 'read'} {target or ''}"
                )

        text = "相关 Schema 摘要\n\n" + "\n\n".join(sections)
        if rel_lines:
            text += "\n\n逻辑关联：\n" + "\n".join(rel_lines)
        elif not q:
            for row in repo.fetch_all_relations_summary(cur, graph_id):
                flag = " [verified]" if row.get("verified") else " [unverified]"
                rel_lines.append(
                    f"- {row['relation_key']}: {row.get('join_condition')} "
                    f"({match_operator_label(row.get('match_operator'))}, conf={row.get('confidence')}){flag}"
                )
            if rel_lines:
                text += "\n\n逻辑关联：\n" + "\n".join(rel_lines)
        if flow_lines:
            text += "\n\n业务流程绑定：\n" + "\n".join(flow_lines)
        if business_flow_context.get("businessFlows"):
            text += "\n\n结构化业务流程上下文已随响应的 businessFlowContext 返回。"

        return {
            "graph_id": str(graph_id),
            "version": version,
            "text": text,
            "documents": docs,
            "businessFlowContext": business_flow_context,
        }


agent_context_service = AgentContextService()
