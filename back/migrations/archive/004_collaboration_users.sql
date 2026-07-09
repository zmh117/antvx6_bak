-- Lightweight local users, graph membership, and Yjs audit columns.

CREATE TABLE IF NOT EXISTS app_user (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS er_graph_member (
    graph_id UUID NOT NULL REFERENCES er_graph(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (graph_id, user_id),
    CHECK (role IN ('owner', 'editor', 'viewer'))
);

ALTER TABLE er_yjs_update ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE er_yjs_update ADD COLUMN IF NOT EXISTS update_size INT NOT NULL DEFAULT 0;
ALTER TABLE er_yjs_update ADD COLUMN IF NOT EXISTS origin TEXT;

CREATE INDEX IF NOT EXISTS idx_er_graph_member_user ON er_graph_member(user_id);
CREATE INDEX IF NOT EXISTS idx_er_yjs_update_graph_created ON er_yjs_update(graph_id, created_at);

COMMENT ON TABLE app_user IS '轻量内建用户：v1 用邮箱密码登录，后续可替换为 OIDC/SSO 映射';
COMMENT ON COLUMN app_user.id IS '用户主键 UUID';
COMMENT ON COLUMN app_user.email IS '用户登录邮箱，系统内唯一';
COMMENT ON COLUMN app_user.display_name IS '用户显示名称，用于协同在线列表和操作标识';
COMMENT ON COLUMN app_user.password_hash IS '密码哈希，不保存明文密码';
COMMENT ON COLUMN app_user.status IS '用户状态：active 表示可登录，disabled 表示禁用';
COMMENT ON COLUMN app_user.created_at IS '用户创建时间';
COMMENT ON COLUMN app_user.updated_at IS '用户资料最后更新时间';

COMMENT ON TABLE app_session IS '轻量登录会话：保存 refresh token 哈希，用于后续扩展刷新登录态和主动吊销';
COMMENT ON COLUMN app_session.id IS '会话主键 UUID';
COMMENT ON COLUMN app_session.user_id IS '所属用户，关联 app_user.id';
COMMENT ON COLUMN app_session.refresh_token_hash IS '刷新令牌哈希，用于服务端校验 refresh token';
COMMENT ON COLUMN app_session.expires_at IS '刷新令牌过期时间';
COMMENT ON COLUMN app_session.revoked_at IS '会话吊销时间，NULL 表示未吊销';
COMMENT ON COLUMN app_session.created_at IS '会话创建时间';

COMMENT ON TABLE er_graph_member IS 'ER 图成员权限：owner/editor/viewer 控制 HTTP API 与 Yjs room';
COMMENT ON COLUMN er_graph_member.graph_id IS '所属 ER 图，关联 er_graph.id';
COMMENT ON COLUMN er_graph_member.user_id IS '图成员用户，关联 app_user.id';
COMMENT ON COLUMN er_graph_member.role IS '成员角色：owner 可管理图和成员，editor 可编辑，viewer 只读';
COMMENT ON COLUMN er_graph_member.created_at IS '成员加入时间';

COMMENT ON COLUMN er_yjs_update.user_id IS '产生该 Yjs update 的用户';
COMMENT ON COLUMN er_yjs_update.update_size IS 'Yjs update 二进制大小，便于观测异常写入';
COMMENT ON COLUMN er_yjs_update.origin IS '客户端事务来源，如 x6-local、restore、seed';
