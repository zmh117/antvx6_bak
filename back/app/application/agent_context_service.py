"""Agent 上下文组装应用服务。

将 ER 检索文档、逻辑关联、以及业务图（legacy er_business_flow 与新泳道 business_flow）
统一组装为 Agent 写用例所需的上下文文本与文档列表。
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import psycopg

from app.domain.business_flow.semantic_profile import (
    business_flow_quality_issues,
    semantic_payload,
)
from app.domain.business_flow.task_ui import (
    edge_scope,
    is_legacy_process_container,
    is_process_container,
    process_container_quality_issues,
    process_container_payload,
    task_ui_payload,
)
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


def _semantic_line(prefix: str, item: dict[str, Any]) -> str:
    profile_key = item.get("semantic_profile_key")
    payload = semantic_payload(item.get("semantic_payload_json"))
    if not profile_key and not payload:
        return ""
    return f"  {prefix}：{profile_key or ''} {_json_summary(payload)}".rstrip()


def _task_ui_line(node: dict[str, Any]) -> str:
    payload = task_ui_payload(node.get("task_ui_json"))
    if not payload:
        return ""
    return f"  Task UI：{_json_summary(payload)}"


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
                            "condition": edge.get("condition_text")
                            or edge.get("bpmn_condition_expression")
                            or semantic_payload(edge.get("semantic_payload_json")).get("condition"),
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
                        "exceptionType": semantic_payload(edge.get("semantic_payload_json")).get("exceptionType"),
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


def _strip_legacy_process_containers(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    removed_keys = {
        str(node.get("node_key"))
        for node in nodes
        if node.get("node_key") and is_legacy_process_container(node)
    }
    if not removed_keys:
        return nodes, edges
    clean_nodes = [
        {
            **node,
            "process_container_json": {},
            "container_node_key": None,
        }
        for node in nodes
        if str(node.get("node_key") or "") not in removed_keys
    ]
    clean_edges = [
        edge
        for edge in edges
        if str(edge.get("source_node_key") or "") not in removed_keys
        and str(edge.get("target_node_key") or "") not in removed_keys
    ]
    return clean_nodes, clean_edges


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
    nodes, edges = _strip_legacy_process_containers(nodes, edges)
    step_lines = [
        "\n".join(
            filter(
                None,
                [
                    f"- {node['node_key']}: {node['title']} ({node['node_type']})",
                    f"  BPMN：{node.get('bpmn_element_type') or ''}"
                    + (
                        f"/{node.get('bpmn_event_kind') or node.get('bpmn_task_type') or node.get('bpmn_gateway_type')}"
                        if node.get("bpmn_event_kind") or node.get("bpmn_task_type") or node.get("bpmn_gateway_type")
                        else ""
                    ),
                    f"  泳道：{node.get('lane_name') or ''}" if node.get("lane_name") else "",
                    f"  角色：{node.get('actor') or ''}" if node.get("actor") else "",
                    f"  规则：{node.get('business_rule') or ''}"
                    if node.get("business_rule")
                    else "",
                    f"  输入：{node.get('input_summary') or ''}" if node.get("input_summary") else "",
                    f"  输出：{node.get('output_summary') or ''}" if node.get("output_summary") else "",
                    _semantic_line("业务语义", node),
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
                    f"  条件：{edge.get('condition_text') or edge.get('bpmn_condition_expression') or ''}"
                    if edge.get("condition_text") or edge.get("bpmn_condition_expression")
                    else "",
                    f"  消息：{edge.get('bpmn_message_name') or ''}" if edge.get("bpmn_message_name") else "",
                    f"  数据契约：{_json_summary(edge.get('data_contract_json'))}"
                    if edge.get("data_contract_json")
                    else "",
                    _semantic_line("连线语义", edge),
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
        nodes, edges = _strip_legacy_process_containers(nodes, edges)
        refs = repo.fetch_swimlane_flow_er_refs(cur, flow["id"])
        node_keys = {node.get("node_key") for node in nodes}
        refs = [ref for ref in refs if ref.get("node_key") in node_keys]
        refs_by_node_key: dict[str, list[dict[str, Any]]] = {}
        for ref in refs:
            refs_by_node_key.setdefault(ref["node_key"], []).append(ref)
        quality_issues = business_flow_quality_issues(nodes, edges, refs_by_node_key)
        child_keys_by_container: dict[str, list[str]] = {}
        node_by_key = {node.get("node_key"): node for node in nodes if node.get("node_key")}
        for node in nodes:
            container_key = node.get("container_node_key")
            if container_key and node.get("node_key"):
                child_keys_by_container.setdefault(str(container_key), []).append(str(node["node_key"]))
        containers = [
            {
                "containerKey": node.get("node_key"),
                "title": node.get("title"),
                "containerMode": process_container_payload(node.get("process_container_json")).get("containerMode") or "embedded",
                "calledProcessRef": process_container_payload(node.get("process_container_json")).get("calledProcessRef"),
                "calledProcessVersion": process_container_payload(node.get("process_container_json")).get("calledProcessVersion"),
                "childStepKeys": child_keys_by_container.get(str(node.get("node_key")), []),
                "qualityIssues": process_container_quality_issues(
                    node,
                    child_keys_by_container.get(str(node.get("node_key")), []),
                ),
            }
            for node in nodes
            if is_process_container(node)
        ]
        profile_keys = sorted(
            {
                str(item.get("semantic_profile_key"))
                for item in [*nodes, *edges]
                if item.get("semantic_profile_key")
            }
        )
        step_context = [
            {
                "stepKey": node.get("node_key"),
                "title": node.get("title"),
                "nodeType": node.get("node_type"),
                "bpmn": {
                    "elementType": node.get("bpmn_element_type"),
                    "eventKind": node.get("bpmn_event_kind"),
                    "taskType": node.get("bpmn_task_type"),
                    "gatewayType": node.get("bpmn_gateway_type"),
                    "subProcessKind": node.get("bpmn_subprocess_kind"),
                },
                "lane": node.get("lane_name"),
                "actor": node.get("actor"),
                "businessRule": node.get("business_rule"),
                "inputSummary": node.get("input_summary"),
                "outputSummary": node.get("output_summary"),
                "semantic": {
                    "profileKey": node.get("semantic_profile_key"),
                    "profileVersion": node.get("semantic_profile_version"),
                    "payload": semantic_payload(node.get("semantic_payload_json")),
                },
                "erRefs": refs_by_node_key.get(node.get("node_key") or "", []),
                "taskUi": task_ui_payload(node.get("task_ui_json")),
                "processContainer": process_container_payload(node.get("process_container_json")),
                "containerNodeKey": node.get("container_node_key"),
            }
            for node in nodes
        ]
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
                    "messageName": edge.get("bpmn_message_name"),
                    "conditionExpression": edge.get("bpmn_condition_expression"),
                },
                "conditionText": edge.get("condition_text"),
                "dataContract": edge.get("data_contract_json") or {},
                "semantic": {
                    "profileKey": edge.get("semantic_profile_key"),
                    "profileVersion": edge.get("semantic_profile_version"),
                    "payload": semantic_payload(edge.get("semantic_payload_json")),
                },
                "edgeScope": edge_scope(
                    edge.get("source_container_node_key"),
                    edge.get("target_container_node_key"),
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
                "profileKeys": profile_keys,
                "steps": step_context,
                "edges": edge_context,
                "containers": containers,
                "erRefs": refs,
                "rules": [
                    {
                        "stepKey": node.get("node_key"),
                        "businessRule": node.get("business_rule"),
                    }
                    for node in nodes
                    if node.get("business_rule")
                ],
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
        nodes, edges = _strip_legacy_process_containers(nodes, edges)
        node_keys = {node.get("node_key") for node in nodes}
        refs = [ref for ref in refs if ref.get("node_key") in node_keys]
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
