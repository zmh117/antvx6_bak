# DDD 改造路线图

本项目采用务实 DDD：API 行为不变，依赖方向清晰，旧 `services/` 入口保留兼容 shim。

## 后端结构

```text
back/app/
  interfaces/http/
    routers/          # FastAPI 适配器
    schemas/          # HTTP DTO（Pydantic）
  application/        # 用例编排
  domain/             # 业务规则（无 FastAPI / SQL）
    er/               # ErGraph 聚合
    business_flow/    # BusinessFlow 聚合
    shared/           # VersionConflictError 等
  infrastructure/db/
    graph_state_loader.py
    repositories/     # Postgres SQL
  services/           # 兼容 shim（逐步废弃）
```

依赖方向：

```text
interfaces -> application -> domain
application -> infrastructure
infrastructure -> domain
domain -> （无外层依赖）
```

## 同步主链路

1. `GraphSyncService.sync_payload`：单事务 `FOR UPDATE` → load → merge → diff → persist
2. `ErGraph`：版本检查、合并、变更计划
3. `GraphRepository.apply_changes`：SQL + change_log + checkpoint
4. `business_paths`：merge 保留 DB 路径；diff/incremental 全链路支持

## 兼容入口

| 旧 import                                             | 新行为                                     |
| ----------------------------------------------------- | ------------------------------------------ |
| `services.sync.apply_full_sync`                       | → `GraphSyncService.sync_payload`          |
| `services.incremental_sync.apply_payload_with_diff`   | 同上                                       |
| `services.incremental_sync.apply_incremental_changes` | → `GraphRepository`                        |
| `app.schemas.graph`                                   | re-export `interfaces.http.schemas.graph`  |
| `app.routers.graphs`                                  | re-export `interfaces.http.routers.graphs` |

## 前端结构（FSD）

```text
front/src/
  app/                # App、Providers
  entities/           # er-graph API/model、business-flow API
  features/           # er-diagram-editor、business-flow-editor
  shared/api/         # API_BASE 等
```

业务代码已迁入 `app/`、`entities/`、`features/`；根目录不再保留 re-export stub。

## 后续

- 将 `normalize.py` / `load.py` 逐步迁入 application + infrastructure
- Yjs 协同适配器对接 `GraphSyncService`
- 删表时校验 BusinessFlow 绑定约束
