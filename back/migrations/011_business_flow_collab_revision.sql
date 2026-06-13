ALTER TABLE business_flow
    ADD COLUMN IF NOT EXISTS collab_revision BIGINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN business_flow.collab_revision IS
    '业务图协同修订号：历史恢复或全量重建时递增，用于隔离旧 Yjs 房间';
