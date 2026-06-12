"""轻量内建认证：密码哈希、JWT、图成员权限。"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import psycopg
from fastapi import Header, HTTPException, Request, status

from app.config import get_settings

ROLE_RANK = {"viewer": 1, "editor": 2, "owner": 3}


def max_role(*roles: str | None) -> str | None:
    best: str | None = None
    for role in roles:
        if role and ROLE_RANK.get(role, 0) > ROLE_RANK.get(best or "", 0):
            best = role
    return best


@dataclass(frozen=True)
class AuthenticatedUser:
    id: UUID
    email: str
    display_name: str


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 210_000)
    return f"pbkdf2_sha256$210000${_b64url(salt)}${_b64url(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds_s, salt_s, digest_s = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = _b64url_decode(salt_s)
        expected = _b64url_decode(digest_s)
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, int(rounds_s)
        )
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def create_access_token(user: AuthenticatedUser) -> str:
    settings = get_settings()
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": settings.jwt_issuer,
        "sub": str(user.id),
        "email": user.email,
        "name": user.display_name,
        "iat": now,
        "exp": now + settings.jwt_expire_minutes * 60,
    }
    signing_input = ".".join(
        [
            _b64url(json.dumps(header, separators=(",", ":")).encode("utf-8")),
            _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
        ]
    )
    signature = hmac.new(
        settings.jwt_secret.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_b64url(signature)}"


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        header_s, payload_s, signature_s = token.split(".", 2)
        signing_input = f"{header_s}.{payload_s}"
        expected = hmac.new(
            settings.jwt_secret.encode("utf-8"),
            signing_input.encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(expected, _b64url_decode(signature_s)):
            raise ValueError("bad signature")
        payload = json.loads(_b64url_decode(payload_s))
        if payload.get("iss") != settings.jwt_issuer:
            raise ValueError("bad issuer")
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("expired")
        return payload
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired token",
        ) from exc


def bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    return authorization.split(" ", 1)[1].strip()


def get_current_user_from_header(
    authorization: str | None = Header(default=None),
) -> AuthenticatedUser:
    payload = decode_access_token(bearer_token(authorization))
    return AuthenticatedUser(
        id=UUID(str(payload["sub"])),
        email=str(payload.get("email") or ""),
        display_name=str(payload.get("name") or ""),
    )


def current_user_from_request(request: Request) -> AuthenticatedUser:
    return get_current_user_from_header(request.headers.get("authorization"))


def get_graph_role(cur: psycopg.Cursor, graph_id: UUID, user_id: UUID) -> str | None:
    cur.execute(
        """
        SELECT gm.role AS graph_role, pm.role AS product_role
        FROM er_graph g
        LEFT JOIN er_graph_member gm
          ON gm.graph_id = g.id AND gm.user_id = %s
        LEFT JOIN product_member pm
          ON pm.product_id = g.product_id AND pm.user_id = %s
        WHERE g.id = %s AND g.status <> 'archived'
        """,
        (user_id, user_id, graph_id),
    )
    row = cur.fetchone()
    if not row:
        return None
    return max_role(row.get("graph_role"), row.get("product_role"))


def ensure_graph_role(
    cur: psycopg.Cursor,
    graph_id: UUID,
    user_id: UUID,
    min_role: str = "viewer",
) -> str:
    role = get_graph_role(cur, graph_id, user_id)
    if not role or ROLE_RANK.get(role, 0) < ROLE_RANK[min_role]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="graph access denied")
    return role


def get_business_flow_role(
    cur: psycopg.Cursor,
    business_flow_id: UUID,
    user_id: UUID,
) -> str | None:
    cur.execute(
        """
        SELECT bfm.role AS flow_role, pm.role AS product_role
        FROM business_flow bf
        LEFT JOIN business_flow_member bfm
          ON bfm.business_flow_id = bf.id AND bfm.user_id = %s
        LEFT JOIN product_member pm
          ON pm.product_id = bf.product_id AND pm.user_id = %s
        WHERE bf.id = %s AND bf.status <> 'ARCHIVED'
        """,
        (user_id, user_id, business_flow_id),
    )
    row = cur.fetchone()
    if not row:
        return None
    return max_role(row.get("flow_role"), row.get("product_role"))


def ensure_business_flow_role(
    cur: psycopg.Cursor,
    business_flow_id: UUID,
    user_id: UUID,
    min_role: str = "viewer",
) -> str:
    role = get_business_flow_role(cur, business_flow_id, user_id)
    if not role or ROLE_RANK.get(role, 0) < ROLE_RANK[min_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="business flow access denied",
        )
    return role


def get_product_role(cur: psycopg.Cursor, product_id: UUID, user_id: UUID) -> str | None:
    cur.execute(
        """
        SELECT pm.role
        FROM product p
        LEFT JOIN product_member pm
          ON pm.product_id = p.id AND pm.user_id = %s
        WHERE p.id = %s AND p.status <> 'archived'
        """,
        (user_id, product_id),
    )
    row = cur.fetchone()
    return str(row["role"]) if row and row.get("role") else None


def ensure_product_role(
    cur: psycopg.Cursor,
    product_id: UUID,
    user_id: UUID,
    min_role: str = "viewer",
) -> str:
    role = get_product_role(cur, product_id, user_id)
    if not role or ROLE_RANK.get(role, 0) < ROLE_RANK[min_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="product access denied",
        )
    return role


def ensure_internal_token(x_internal_token: str | None) -> None:
    if not x_internal_token or x_internal_token != get_settings().collab_internal_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid internal token")
