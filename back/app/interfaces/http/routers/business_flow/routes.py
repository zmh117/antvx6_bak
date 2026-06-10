"""Routes for the new Business Flow Context."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import get_settings
from app.database import db_transaction, get_connection
from app.interfaces.http.schemas.business_flow import (
    BusinessFlowCreateRequest,
    BusinessFlowMemberResponse,
    BusinessFlowMemberUpsertRequest,
    BusinessFlowMetaResponse,
    BusinessFlowRole,
    BusinessFlowUpdateRequest,
)
from app.services.auth import (
    AuthenticatedUser,
    ensure_business_flow_role,
    get_current_user_from_header,
)

router = APIRouter(prefix="/business-flows", tags=["business-flow"])


def _default_product_id() -> UUID:
    return UUID(get_settings().default_product_id)


BUSINESS_FLOW_META_SELECT = """
SELECT bf.id, bf.product_id, bf.code, bf.name, bf.description,
       bf.status, bf.current_version, bf.updated_at,
       m.role AS current_user_role,
       COUNT(DISTINCT li.id) AS lane_instance_count,
       COUNT(DISTINCT n.id) AS node_count,
       COUNT(DISTINCT e.id) AS edge_count
FROM business_flow bf
JOIN business_flow_member m ON m.business_flow_id = bf.id
LEFT JOIN business_flow_lane_instance li
  ON li.business_flow_id = bf.id AND li.status = 'ACTIVE'
LEFT JOIN business_flow_node n ON n.business_flow_id = bf.id
LEFT JOIN business_flow_edge e ON e.business_flow_id = bf.id
WHERE bf.id = %s AND m.user_id = %s
GROUP BY bf.id, bf.product_id, bf.code, bf.name, bf.description,
         bf.status, bf.current_version, bf.updated_at, m.role
"""


def _business_flow_meta_response(row: dict) -> BusinessFlowMetaResponse:
    return BusinessFlowMetaResponse(
        id=row["id"],
        product_id=row["product_id"],
        code=row["code"],
        name=row["name"],
        description=row["description"],
        status=row["status"],
        current_version=row["current_version"],
        updated_at=row["updated_at"],
        lane_instance_count=row.get("lane_instance_count") or 0,
        node_count=row.get("node_count") or 0,
        edge_count=row.get("edge_count") or 0,
        current_user_role=row.get("current_user_role"),
    )


def _fetch_business_flow_meta(
    cur,
    business_flow_id: UUID,
    user_id: UUID,
) -> BusinessFlowMetaResponse:
    cur.execute(BUSINESS_FLOW_META_SELECT, (business_flow_id, user_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"business flow not found: {business_flow_id}",
        )
    return _business_flow_meta_response(row)


@router.get("", response_model=list[BusinessFlowMetaResponse])
def list_business_flows(
    product_id: UUID | None = None,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[BusinessFlowMetaResponse]:
    selected_product_id = product_id or _default_product_id()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT bf.id, bf.product_id, bf.code, bf.name, bf.description,
                       bf.status, bf.current_version, bf.updated_at,
                       m.role AS current_user_role,
                       COUNT(DISTINCT li.id) AS lane_instance_count,
                       COUNT(DISTINCT n.id) AS node_count,
                       COUNT(DISTINCT e.id) AS edge_count
                FROM business_flow bf
                JOIN business_flow_member m ON m.business_flow_id = bf.id
                LEFT JOIN business_flow_lane_instance li
                  ON li.business_flow_id = bf.id AND li.status = 'ACTIVE'
                LEFT JOIN business_flow_node n ON n.business_flow_id = bf.id
                LEFT JOIN business_flow_edge e ON e.business_flow_id = bf.id
                WHERE m.user_id = %s
                  AND bf.product_id = %s
                  AND bf.status <> 'ARCHIVED'
                GROUP BY bf.id, bf.product_id, bf.code, bf.name, bf.description,
                         bf.status, bf.current_version, bf.updated_at, m.role
                ORDER BY bf.updated_at DESC, lower(bf.name)
                """,
                (user.id, selected_product_id),
            )
            return [_business_flow_meta_response(row) for row in cur.fetchall()]


@router.post("", response_model=BusinessFlowMetaResponse)
def create_business_flow(
    body: BusinessFlowCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMetaResponse:
    product_id = body.product_id or _default_product_id()
    code = body.code.strip()
    name = body.name.strip()
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="business flow code is required")
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="business flow name is required")
    with db_transaction() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM product WHERE id = %s", (product_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")
            try:
                cur.execute(
                    """
                    INSERT INTO business_flow (
                        product_id, code, name, description, created_by, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    RETURNING id
                    """,
                    (product_id, code, name, body.description, str(user.id)),
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="business flow code already exists in product",
                ) from exc
            business_flow_id = cur.fetchone()["id"]
            cur.execute(
                """
                INSERT INTO business_flow_member (business_flow_id, user_id, role)
                VALUES (%s, %s, 'owner')
                ON CONFLICT (business_flow_id, user_id)
                DO UPDATE SET role = 'owner', updated_at = NOW()
                """,
                (business_flow_id, user.id),
            )
            return _fetch_business_flow_meta(cur, business_flow_id, user.id)


@router.get("/{business_flow_id}", response_model=BusinessFlowMetaResponse)
def get_business_flow_meta(
    business_flow_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMetaResponse:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "viewer")
            return _fetch_business_flow_meta(cur, business_flow_id, user.id)


@router.patch("/{business_flow_id}", response_model=BusinessFlowMetaResponse)
def update_business_flow(
    business_flow_id: UUID,
    body: BusinessFlowUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMetaResponse:
    fields_set = body.model_fields_set
    updates: dict[str, str | None] = {}
    if "name" in fields_set:
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="business flow name cannot be empty")
        updates["name"] = name
    if "description" in fields_set:
        updates["description"] = (body.description or "").strip() or None
    if "status" in fields_set and body.status is not None:
        if body.status not in {"DRAFT", "PUBLISHED", "ARCHIVED"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid business flow status")
        updates["status"] = body.status

    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "editor")
            _ensure_active_business_flow(cur, business_flow_id)
            if updates:
                assignments = [f"{field} = %s" for field in updates]
                values = [*updates.values(), business_flow_id]
                cur.execute(
                    f"""
                    UPDATE business_flow
                    SET {", ".join(assignments)}, updated_at = NOW()
                    WHERE id = %s AND status <> 'ARCHIVED'
                    """,
                    values,
                )
                if cur.rowcount == 0:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"business flow not found: {business_flow_id}",
                    )
            return _fetch_business_flow_meta(cur, business_flow_id, user.id)


@router.delete("/{business_flow_id}", response_model=BusinessFlowMetaResponse)
def archive_business_flow(
    business_flow_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMetaResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "owner")
            meta = _fetch_business_flow_meta(cur, business_flow_id, user.id)
            cur.execute(
                """
                UPDATE business_flow
                SET status = 'ARCHIVED', updated_at = NOW()
                WHERE id = %s AND status <> 'ARCHIVED'
                """,
                (business_flow_id,),
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"business flow not found: {business_flow_id}",
                )
            return meta


def _ensure_active_business_flow(cur, business_flow_id: UUID) -> None:
    cur.execute(
        """
        SELECT status
        FROM business_flow
        WHERE id = %s
        """,
        (business_flow_id,),
    )
    row = cur.fetchone()
    if not row or row["status"] == "ARCHIVED":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"business flow not found: {business_flow_id}",
        )


def _owner_count(cur, business_flow_id: UUID) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS n
        FROM business_flow_member
        WHERE business_flow_id = %s AND role = 'owner'
        """,
        (business_flow_id,),
    )
    return int(cur.fetchone()["n"])


def _member_response(row: dict) -> BusinessFlowMemberResponse:
    return BusinessFlowMemberResponse(
        user_id=row["user_id"],
        email=row["email"],
        display_name=row["display_name"],
        role=row["role"],
        created_at=row["created_at"],
        is_creator=bool(row.get("is_creator")),
    )


def _fetch_business_flow_member(
    cur,
    business_flow_id: UUID,
    user_id: UUID,
) -> BusinessFlowMemberResponse:
    cur.execute(
        """
        SELECT m.user_id, u.email, u.display_name, m.role, m.created_at,
               (bf.created_by = m.user_id::text) AS is_creator
        FROM business_flow_member m
        JOIN app_user u ON u.id = m.user_id
        JOIN business_flow bf ON bf.id = m.business_flow_id
        WHERE m.business_flow_id = %s AND m.user_id = %s
        """,
        (business_flow_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="business flow member not found",
        )
    return _member_response(row)


@router.get("/{business_flow_id}/members", response_model=list[BusinessFlowMemberResponse])
def list_business_flow_members(
    business_flow_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[BusinessFlowMemberResponse]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "owner")
            _ensure_active_business_flow(cur, business_flow_id)
            cur.execute(
                """
                SELECT m.user_id, u.email, u.display_name, m.role, m.created_at,
                       (bf.created_by = m.user_id::text) AS is_creator
                FROM business_flow_member m
                JOIN app_user u ON u.id = m.user_id
                JOIN business_flow bf ON bf.id = m.business_flow_id
                WHERE m.business_flow_id = %s
                ORDER BY m.created_at ASC, lower(u.email)
                """,
                (business_flow_id,),
            )
            return [_member_response(row) for row in cur.fetchall()]


@router.put("/{business_flow_id}/members", response_model=BusinessFlowMemberResponse)
def upsert_business_flow_member(
    business_flow_id: UUID,
    body: BusinessFlowMemberUpsertRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMemberResponse:
    email = body.email.strip().lower()
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "owner")
            _ensure_active_business_flow(cur, business_flow_id)
            cur.execute(
                """
                SELECT id
                FROM app_user
                WHERE lower(email) = %s AND status = 'active'
                """,
                (email,),
            )
            target = cur.fetchone()
            if not target:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="active user not found")
            target_user_id = target["id"]

            cur.execute(
                """
                SELECT created_by
                FROM business_flow
                WHERE id = %s AND status <> 'ARCHIVED'
                """,
                (business_flow_id,),
            )
            flow_row = cur.fetchone()
            if not flow_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"business flow not found: {business_flow_id}",
                )
            if flow_row["created_by"] == str(target_user_id) and body.role != "owner":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="business flow creator must remain owner",
                )

            cur.execute(
                """
                SELECT role
                FROM business_flow_member
                WHERE business_flow_id = %s AND user_id = %s
                """,
                (business_flow_id, target_user_id),
            )
            existing = cur.fetchone()
            if (
                existing
                and existing["role"] == "owner"
                and body.role != "owner"
                and _owner_count(cur, business_flow_id) <= 1
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot demote the last owner",
                )

            cur.execute(
                """
                INSERT INTO business_flow_member (business_flow_id, user_id, role)
                VALUES (%s, %s, %s)
                ON CONFLICT (business_flow_id, user_id)
                DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
                """,
                (business_flow_id, target_user_id, body.role),
            )
            return _fetch_business_flow_member(cur, business_flow_id, target_user_id)


@router.delete(
    "/{business_flow_id}/members/{member_user_id}",
    response_model=BusinessFlowMemberResponse,
)
def remove_business_flow_member(
    business_flow_id: UUID,
    member_user_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> BusinessFlowMemberResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_business_flow_role(cur, business_flow_id, user.id, "owner")
            _ensure_active_business_flow(cur, business_flow_id)
            member = _fetch_business_flow_member(cur, business_flow_id, member_user_id)
            if member.is_creator:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="business flow creator cannot be removed",
                )
            if member.role == "owner" and _owner_count(cur, business_flow_id) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot remove the last owner",
                )
            cur.execute(
                """
                DELETE FROM business_flow_member
                WHERE business_flow_id = %s AND user_id = %s
                """,
                (business_flow_id, member_user_id),
            )
            return member
