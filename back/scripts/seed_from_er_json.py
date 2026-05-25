"""Restore graph from front/public/data/er.json via sync/canvas."""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000"
GRAPH = "00000000-0000-0000-0000-000000000001"
ER_JSON = Path(__file__).resolve().parents[2] / "front" / "public" / "data" / "er.json"


def req(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main() -> int:
    if not ER_JSON.is_file():
        print(f"missing {ER_JSON}", file=sys.stderr)
        return 1
    legacy = json.loads(ER_JSON.read_text(encoding="utf-8"))
    code, loaded = req("GET", f"/api/graphs/{GRAPH}")
    if code != 200:
        print(f"load failed: {code} {loaded}")
        return 1
    ver = loaded.get("graph", {}).get("version", 1)
    body = {
        "x6Json": {"nodes": [], "edges": []},
        "legacyTables": legacy,
        "baseVersion": ver,
        "clientId": "seed-er-json",
    }
    code, sync = req("POST", f"/api/graphs/{GRAPH}/sync/canvas", body)
    print(f"sync {code} -> {sync}")
    if code != 200:
        return 1
    code, loaded2 = req("GET", f"/api/graphs/{GRAPH}")
    if code == 200:
        print(
            f"after seed: version={loaded2.get('graph', {}).get('version')} "
            f"legacy={len(loaded2.get('legacy_tables', []))} "
            f"relations={len(loaded2.get('relations', []))}"
        )
        for t in loaded2.get("legacy_tables", []):
            print(f"  - {t.get('id')}: {len(t.get('fields', []))} fields")
    return 0


if __name__ == "__main__":
    sys.exit(main())
