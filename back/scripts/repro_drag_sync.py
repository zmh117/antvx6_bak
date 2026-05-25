"""Reproduce drag sync 500 with user payload."""
import json
import sys
import traceback
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import db_transaction, get_connection
from app.schemas.graph import CanvasSnapshotPayload
from app.services.incremental_sync import apply_payload_with_diff
from app.services.normalize import normalize_legacy_tables_array

GRAPH = UUID("00000000-0000-0000-0000-000000000001")

PAYLOAD = {
    "x6Json": {
        "nodes": [
            {
                "position": {"x": 0, "y": 60},
                "size": {"width": 240, "height": 72},
                "shape": "er-table",
                "id": "posts",
                "data": {
                    "id": "posts",
                    "name": "posts",
                    "fields": [{"name": "id", "type": "bigint", "keyType": "primary"}],
                    "layout": {"x": 100, "y": 100},
                },
            }
        ],
        "edges": [],
    },
    "legacyTables": [
        {
            "id": "posts",
            "name": "posts",
            "fields": [{"name": "id", "type": "bigint", "keyType": "primary"}],
            "layout": {"x": 0, "y": 60},
        }
    ],
    "baseVersion": 179,
    "clientId": "web-client",
}


def main() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT version FROM er_graph WHERE id = %s", (GRAPH,))
            print("db version:", cur.fetchone()["version"])

    snap_nodes = PAYLOAD["x6Json"]["nodes"]
    snap_edges = PAYLOAD["x6Json"].get("edges") or []
    payload = normalize_legacy_tables_array(
        GRAPH,
        PAYLOAD["legacyTables"],
        snapshot=CanvasSnapshotPayload(nodes=snap_nodes, edges=snap_edges),
        base_version=PAYLOAD["baseVersion"],
    )
    payload.client_id = PAYLOAD["clientId"]
    try:
        with db_transaction() as conn:
            r = apply_payload_with_diff(conn, payload)
            print("OK new_version=", r.new_version, "warnings=", r.warnings)
    except Exception:
        traceback.print_exc()


if __name__ == "__main__":
    main()
