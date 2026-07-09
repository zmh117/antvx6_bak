ALTER TABLE collab_update
    ADD COLUMN IF NOT EXISTS user_id TEXT,
    ADD COLUMN IF NOT EXISTS update_size BIGINT,
    ADD COLUMN IF NOT EXISTS origin TEXT;

COMMENT ON COLUMN collab_update.user_id IS '协同更新发起用户';
COMMENT ON COLUMN collab_update.update_size IS 'Yjs update 字节数';
COMMENT ON COLUMN collab_update.origin IS 'Yjs transaction origin';
