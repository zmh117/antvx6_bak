"""Agent 文档展示用标签映射。"""

from __future__ import annotations

RELATION_TYPE_LABELS = {
    "identifier_match": "标识匹配",
    "ownership": "归属关系",
    "lookup": "码值/维表映射",
    "same_meaning": "同义字段",
    "hierarchy": "层级关系",
    "derived": "派生关系",
    "business_process": "业务流程关联",
    "semantic_related": "语义相关",
    "logical_relation": "逻辑关系",
    "foreign_key": "外键关系",
    "business_relation": "业务关系",
    "lookup_relation": "查询关系",
    "derived_relation": "派生关系",
    "unknown": "未知",
}

MATCH_OPERATOR_LABELS = {
    "eq": "等于",
    "contains": "包含",
    "included_in": "被包含",
    "prefix_match": "前缀匹配",
    "pattern_match": "模式匹配",
    "range_match": "区间匹配",
    "mapping": "映射转换",
    "semantic_match": "语义适配",
}


def relation_type_label(value: str | None) -> str:
    return RELATION_TYPE_LABELS.get(value or "", value or "标识匹配")


def match_operator_label(value: str | None) -> str:
    return MATCH_OPERATOR_LABELS.get(value or "", value or "等于")
