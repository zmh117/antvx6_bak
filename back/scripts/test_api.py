"""Quick API smoke test."""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8000"
GRAPH = "00000000-0000-0000-0000-000000000001"


def req(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = raw
        return e.code, detail


def main() -> int:
    ok = True

    code, loaded0 = req("GET", f"/api/graphs/{GRAPH}")
    base_version = loaded0.get("graph", {}).get("version", 1) if code == 200 else 1
    print(f"[load initial] version={base_version}")

    code, health = req("GET", "/api/health")
    print(f"[health] {code} -> {health}")
    ok &= code == 200

    code, gid = req("GET", "/api/graphs/default/id")
    print(f"[default id] {code} -> {gid}")
    ok &= code == 200

    sync_body = {
        "x6Json": {"nodes": [], "edges": []},
        "legacyTables": [
            {
                "id": "posts",
                "name": "posts",
                "businessName": "文章表",
                "fields": [
                    {"name": "id", "type": "bigint", "keyType": "primary"},
                    {
                        "name": "user_id",
                        "type": "bigint",
                        "keyType": "relation",
                        "ref": {"table": "users", "field": "id", "relationship": "N:1"},
                    },
                ],
                "layout": {"x": 100, "y": 100},
            },
            {
                "id": "users",
                "name": "users",
                "fields": [{"name": "id", "type": "bigint", "keyType": "primary"}],
                "layout": {"x": 400, "y": 100},
            },
        ],
        "baseVersion": base_version,
        "clientId": "test-script",
    }
    code, sync = req("POST", f"/api/graphs/{GRAPH}/sync/canvas", sync_body)
    print(f"[sync/canvas] {code} -> {sync}")
    ok &= code == 200

    if code == 200:
        ver = sync.get("new_version")
        sync_body["baseVersion"] = ver
        sync_body["legacyTables"][0]["businessName"] = "文章表(更新)"
        code2, sync2 = req("POST", f"/api/graphs/{GRAPH}/sync/canvas", sync_body)
        print(f"[sync/canvas v{ver}] {code2} -> {sync2}")
        ok &= code2 == 200
        base_version = sync2.get("new_version", ver)

        # 相同 payload + operationSource=undo：空 diff 不应递增版本
        noop_undo = {**sync_body, "baseVersion": base_version, "operationSource": "undo"}
        code_u, sync_u = req("POST", f"/api/graphs/{GRAPH}/sync/canvas", noop_undo)
        print(f"[sync/canvas undo noop] {code_u} -> {sync_u}")
        ok &= code_u == 200 and sync_u.get("new_version") == base_version

        # 有变更时 operationSource 写入 checkpoint 摘要
        sync_body["baseVersion"] = base_version
        sync_body["operationSource"] = "manual_save"
        sync_body["legacyTables"][0]["description"] = "test operation source"
        code_m, sync_m = req("POST", f"/api/graphs/{GRAPH}/sync/canvas", sync_body)
        print(f"[sync/canvas manual_save] {code_m} -> {sync_m}")
        ok &= code_m == 200
        if code_m == 200:
            base_version = sync_m.get("new_version", base_version)
            code_h, hist_m = req("GET", f"/api/graphs/{GRAPH}/history?limit=5")
            entries_m = hist_m.get("entries", []) if isinstance(hist_m, dict) else []
            manual_cp = next(
                (
                    e
                    for e in entries_m
                    if e.get("change_type") == "checkpoint"
                    and (e.get("after_data") or {}).get("operation_source") == "manual_save"
                ),
                None,
            )
            print(f"[history manual_save checkpoint] found={manual_cp is not None}")
            ok &= manual_cp is not None and "手动保存" in (manual_cp.get("summary") or "")

    # 409 版本冲突
    code, conflict = req(
        "POST",
        f"/api/graphs/{GRAPH}/sync/canvas",
        {**sync_body, "baseVersion": max(1, base_version - 10)},
    )
    print(f"[sync/canvas conflict] {code} -> {conflict}")
    ok &= code == 409

    # business_paths：先 seed 一条，再 canvas sync 不应丢失
    path_payload = {
        "payload": {
            "graph_id": GRAPH,
            "base_version": base_version,
            "client_id": "test-path-seed",
            "tables": [],
            "columns": [],
            "enums": [],
            "relations": [],
            "business_paths": [
                {
                    "path_key": "test_user_path",
                    "name": "用户路径",
                    "intent": "test",
                    "table_keys": ["users"],
                    "relation_keys": [],
                    "path_json": {},
                    "confidence": 1.0,
                }
            ],
            "snapshot": {"nodes": [], "edges": []},
            "legacy_tables": sync_body["legacyTables"],
        }
    }
    code, path_sync = req("POST", f"/api/graphs/{GRAPH}/sync", path_payload)
    print(f"[sync with business_path] {code} -> new_version={path_sync.get('new_version') if isinstance(path_sync, dict) else path_sync}")
    ok &= code == 200

    if code == 200:
        base_version = path_sync.get("new_version", base_version)

    code, loaded_paths = req("GET", f"/api/graphs/{GRAPH}")
    paths = loaded_paths.get("business_paths", []) if isinstance(loaded_paths, dict) else []
    print(f"[load business_paths] count={len(paths)}")
    ok &= code == 200 and any(p.get("path_key") == "test_user_path" for p in paths)

    loaded_after = loaded_paths
    if code == 200:
        sync_body["baseVersion"] = base_version
        code, sync_keep = req("POST", f"/api/graphs/{GRAPH}/sync/canvas", sync_body)
        print(f"[sync/canvas keep paths] {code}")
        ok &= code == 200
        code, loaded_after = req("GET", f"/api/graphs/{GRAPH}")
        paths_after = loaded_after.get("business_paths", []) if isinstance(loaded_after, dict) else []
        ok &= any(p.get("path_key") == "test_user_path" for p in paths_after)
        print(f"[paths after canvas sync] count={len(paths_after)}")

    # sync/changes 增量
    if isinstance(loaded_after, dict):
        lv = loaded_after.get("graph", {}).get("version", base_version)
        changes_body = {
            "graph_id": GRAPH,
            "base_version": lv,
            "client_id": "test-changes",
            "changes": {
                "tables": {"added": [], "updated": [], "deleted": []},
                "columns": {"added": [], "updated": [], "deleted": []},
                "enums": {"added": [], "updated": [], "deleted": []},
                "relations": {"added": [], "updated": [], "deleted": []},
                "business_paths": {"added": [], "updated": [], "deleted": []},
            },
        }
        code, ch = req("POST", f"/api/graphs/{GRAPH}/sync/changes", changes_body)
        print(f"[sync/changes noop] {code} -> {ch.get('new_version') if isinstance(ch, dict) else ch}")
        ok &= code == 200

    # history + restore
    code, hist = req("GET", f"/api/graphs/{GRAPH}/history?limit=20")
    entries = hist.get("entries", []) if isinstance(hist, dict) else []
    checkpoint_id = next((e["id"] for e in entries if e.get("change_type") == "checkpoint"), None)
    print(f"[history] {code} entries={len(entries)} checkpoint_id={checkpoint_id}")
    ok &= code == 200 and checkpoint_id is not None

    if checkpoint_id:
        code, restored = req(
            "POST",
            f"/api/graphs/{GRAPH}/restore",
            {"change_log_id": checkpoint_id},
        )
        print(f"[restore] {code} -> {restored}")
        ok &= code == 200

    # business flow CRUD
    flow_body = {
        "flow_key": "order_flow",
        "name": "订单流程",
        "description": "test",
        "nodes": [{"id": "s1", "label": "创建订单"}],
        "edges": [],
        "bindings": [
            {
                "binding_key": "b1",
                "step_key": "s1",
                "table_key": "posts",
                "usage_type": "read",
            }
        ],
    }
    code, flow = req("PUT", f"/api/graphs/{GRAPH}/business-flows/order_flow", flow_body)
    print(f"[business-flow put] {code} -> {flow.get('flow_key') if isinstance(flow, dict) else flow}")
    ok &= code == 200

    code, flows = req("GET", f"/api/graphs/{GRAPH}/business-flows")
    print(f"[business-flow list] {code} count={len(flows.get('flows', [])) if isinstance(flows, dict) else 0}")
    ok &= code == 200

    code, loaded = req("GET", f"/api/graphs/{GRAPH}")
    print(f"[load] {code} -> graph.version={loaded.get('graph', {}).get('version')}, "
          f"tables={len(loaded.get('tables', []))}, relations={len(loaded.get('relations', []))}, "
          f"legacy={len(loaded.get('legacy_tables', []))}")
    ok &= code == 200 and len(loaded.get("tables", [])) >= 2

    q = urllib.parse.quote("文章")
    code, ctx = req("GET", f"/api/graphs/{GRAPH}/agent-context?q={q}")
    text = ctx.get("text", "") if isinstance(ctx, dict) else ""
    print(f"[agent-context] {code} -> text_len={len(text)}")
    ok &= code == 200 and len(text) > 0

    print("\n" + ("ALL OK" if ok else "SOME FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
