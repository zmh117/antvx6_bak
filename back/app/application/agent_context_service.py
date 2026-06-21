"""Agent 上下文组装应用服务。

将 ER 检索文档、逻辑关联、以及业务图（legacy er_business_flow 与新泳道 business_flow）
统一组装为 Agent 写用例所需的上下文文本与文档列表。
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import psycopg

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
                    f"  MES：{_json_summary(node.get('mes_semantics_json'))}"
                    if node.get("mes_semantics_json")
                    else "",
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
                    f"  MES：{_json_summary(edge.get('mes_semantics_json'))}"
                    if edge.get("mes_semantics_json")
                    else "",
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

        return {
            "graph_id": str(graph_id),
            "version": version,
            "text": text,
            "documents": docs,
        }


agent_context_service = AgentContextService()
