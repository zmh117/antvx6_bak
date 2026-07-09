-- 多数据库 ER 导入：连接配置与 graph 来源连接。

CREATE TABLE IF NOT EXISTS er_database_connection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    db_type TEXT NOT NULL,
    host TEXT NOT NULL,
    port INT NOT NULL,
    database_name TEXT NOT NULL,
    schema_name TEXT,
    username TEXT NOT NULL,
    password_ciphertext TEXT,
    password_ref TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (db_type IN ('mysql', 'oracle', 'sqlserver')),
    CHECK (status IN ('active', 'disabled'))
);

ALTER TABLE er_graph
    ADD COLUMN IF NOT EXISTS source_connection_id UUID
    REFERENCES er_database_connection(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_er_database_connection_type
    ON er_database_connection(db_type, status);

CREATE INDEX IF NOT EXISTS idx_er_graph_source_connection
    ON er_graph(source_connection_id);

COMMENT ON TABLE er_database_connection IS 'ER 导入源数据库连接配置：支持 MySQL、Oracle、SQL Server，密码加密保存或引用环境变量';
COMMENT ON COLUMN er_database_connection.id IS '连接配置主键 UUID';
COMMENT ON COLUMN er_database_connection.connection_key IS '稳定连接键，用于 env 种子和外部引用，系统内唯一';
COMMENT ON COLUMN er_database_connection.name IS '连接显示名称';
COMMENT ON COLUMN er_database_connection.db_type IS '数据库类型：mysql/oracle/sqlserver';
COMMENT ON COLUMN er_database_connection.host IS '目标数据库主机';
COMMENT ON COLUMN er_database_connection.port IS '目标数据库端口';
COMMENT ON COLUMN er_database_connection.database_name IS '目标数据库名或 Oracle service name';
COMMENT ON COLUMN er_database_connection.schema_name IS '目标 schema；MySQL 默认等于 database_name，SQL Server 默认 dbo，Oracle 默认用户名';
COMMENT ON COLUMN er_database_connection.username IS '目标数据库用户名';
COMMENT ON COLUMN er_database_connection.password_ciphertext IS '加密后的目标数据库密码，API 不返回明文';
COMMENT ON COLUMN er_database_connection.password_ref IS '环境变量种子连接的密码引用值，仅用于本地默认连接迁移';
COMMENT ON COLUMN er_database_connection.status IS '连接状态：active 可用 / disabled 停用';
COMMENT ON COLUMN er_database_connection.created_at IS '连接创建时间';
COMMENT ON COLUMN er_database_connection.updated_at IS '连接更新时间';

COMMENT ON COLUMN er_graph.source_connection_id IS '该 ER 图最近一次数据库导入使用的连接配置，关联 er_database_connection.id';
