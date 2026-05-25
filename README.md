# antvX6 ER 图

## 目录结构

```
antvX6/
├── front/          # 前端（Vite + React + AntV X6）
├── back/           # 后端（预留）
└── package.json    # 根脚本：转发到 front
```

## 前端

```bash
# 在仓库根目录
npm run dev

# 或进入 front
cd front && npm install && npm run dev
```

- 开发地址：默认 `http://localhost:5173`
- ER 数据：`front/public/data/er.json`
- 开发环境保存：POST `/api/save-er-json`（由 `front/vite.config.ts` 写入上述 JSON）

## 后端

见 [back/README.md](./back/README.md)。

uvicorn app.main:app --reload --port 8001
