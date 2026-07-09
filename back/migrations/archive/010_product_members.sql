-- Product Context membership and inherited permissions for ER graphs, business flows,
-- and reusable swimlane components.

CREATE TABLE IF NOT EXISTS product_member (
    product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_product_member_user
    ON product_member(user_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_product_member_role'
          AND conrelid = 'product_member'::regclass
    ) THEN
        ALTER TABLE product_member
            ADD CONSTRAINT ck_product_member_role
            CHECK (role IN ('owner', 'editor', 'viewer'));
    END IF;
END $$;

WITH inherited_members AS (
    SELECT g.product_id, m.user_id, m.role, m.created_at
    FROM er_graph g
    JOIN er_graph_member m ON m.graph_id = g.id
    WHERE g.product_id IS NOT NULL

    UNION ALL

    SELECT bf.product_id, m.user_id, m.role, m.created_at
    FROM business_flow bf
    JOIN business_flow_member m ON m.business_flow_id = bf.id
    WHERE bf.product_id IS NOT NULL
),
ranked AS (
    SELECT
        product_id,
        user_id,
        MAX(
            CASE role
                WHEN 'owner' THEN 3
                WHEN 'editor' THEN 2
                ELSE 1
            END
        ) AS role_rank,
        MIN(created_at) AS created_at
    FROM inherited_members
    GROUP BY product_id, user_id
)
INSERT INTO product_member (product_id, user_id, role, created_at, updated_at)
SELECT
    product_id,
    user_id,
    CASE role_rank
        WHEN 3 THEN 'owner'
        WHEN 2 THEN 'editor'
        ELSE 'viewer'
    END,
    COALESCE(created_at, NOW()),
    NOW()
FROM ranked
ON CONFLICT (product_id, user_id) DO UPDATE
SET
    role = CASE
        WHEN product_member.role = 'owner' OR EXCLUDED.role = 'owner' THEN 'owner'
        WHEN product_member.role = 'editor' OR EXCLUDED.role = 'editor' THEN 'editor'
        ELSE 'viewer'
    END,
    updated_at = NOW();

COMMENT ON TABLE product_member IS '产品成员权限：产品下 ER 图、业务图、泳道组件默认继承 owner/editor/viewer 权限';
COMMENT ON COLUMN product_member.product_id IS '所属产品，关联 product.id';
COMMENT ON COLUMN product_member.user_id IS '产品成员用户，关联 app_user.id';
COMMENT ON COLUMN product_member.role IS '产品角色：owner 可管理产品和成员，editor 可创建/编辑资产，viewer 只读';
