-- 协同文档版本隔离：导入/恢复等重建图操作递增该值，旧 Yjs 房间不得再物化回当前图。

ALTER TABLE er_graph
    ADD COLUMN IF NOT EXISTS collab_revision BIGINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN er_graph.collab_revision IS '协同文档版本号；导入、历史恢复等重建图操作递增，用于隔离旧 Yjs 房间';
