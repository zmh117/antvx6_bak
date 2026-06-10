-- Business Flow Context membership and sharing permissions.

CREATE TABLE IF NOT EXISTS business_flow_member (
    business_flow_id UUID NOT NULL REFERENCES business_flow(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (business_flow_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_business_flow_member_user
    ON business_flow_member(user_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_member_role'
          AND conrelid = 'business_flow_member'::regclass
    ) THEN
        ALTER TABLE business_flow_member
            ADD CONSTRAINT ck_business_flow_member_role
            CHECK (role IN ('owner', 'editor', 'viewer'));
    END IF;
END $$;

INSERT INTO business_flow_member (business_flow_id, user_id, role, created_at, updated_at)
SELECT bf.id, u.id, 'owner', COALESCE(bf.created_at, NOW()), NOW()
FROM business_flow bf
JOIN app_user u ON u.id::text = bf.created_by
WHERE bf.created_by IS NOT NULL
ON CONFLICT (business_flow_id, user_id) DO NOTHING;

COMMENT ON TABLE business_flow_member IS '业务图成员权限：owner/editor/viewer 控制 Business Flow Context HTTP API 与后续 Yjs room';
COMMENT ON COLUMN business_flow_member.business_flow_id IS '所属业务图，关联 business_flow.id';
COMMENT ON COLUMN business_flow_member.user_id IS '业务图成员用户，关联 app_user.id';
COMMENT ON COLUMN business_flow_member.role IS '成员角色：owner 可管理业务图和成员，editor 可编辑，viewer 只读';
COMMENT ON COLUMN business_flow_member.created_at IS '成员加入时间';
