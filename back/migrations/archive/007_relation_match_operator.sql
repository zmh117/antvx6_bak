-- Add logical field match operator for non-FK ER relations.

ALTER TABLE er_relation
  ADD COLUMN IF NOT EXISTS match_operator TEXT NOT NULL DEFAULT 'eq';

UPDATE er_relation
SET match_operator = COALESCE(NULLIF(raw_edge->'data'->>'matchOperator', ''), match_operator, 'eq')
WHERE match_operator IS NULL OR match_operator = '';

COMMENT ON COLUMN er_relation.match_operator IS '字段匹配方式：eq/contains/included_in/prefix_match/pattern_match/range_match/mapping/semantic_match；替代 UI 中的基数选择';
