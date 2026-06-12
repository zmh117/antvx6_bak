from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import db_transaction, get_connection
from app.interfaces.http.schemas.product import (
    ProductCreateRequest,
    ProductMemberResponse,
    ProductMemberUpsertRequest,
    ProductMetaResponse,
    ProductRole,
    ProductUpdateRequest,
)
from app.services.auth import (
    AuthenticatedUser,
    ensure_product_role,
    get_current_user_from_header,
)

router = APIRouter(prefix="/products", tags=["products"])


PRODUCT_META_SELECT = """
SELECT p.id, p.code, p.name, p.description, p.status, p.created_at, p.updated_at,
       pm.role AS current_user_role,
       COUNT(DISTINCT g.id) AS er_graph_count,
       COUNT(DISTINCT bf.id) AS business_flow_count,
       COUNT(DISTINCT sc.id) AS swimlane_component_count
FROM product p
JOIN product_member pm ON pm.product_id = p.id
LEFT JOIN er_graph g ON g.product_id = p.id AND g.status <> 'archived'
LEFT JOIN business_flow bf ON bf.product_id = p.id AND bf.status <> 'ARCHIVED'
LEFT JOIN swimlane_component sc
  ON sc.product_id = p.id
 AND sc.status <> 'ARCHIVED'
 AND sc.deleted_at IS NULL
WHERE p.id = %s AND pm.user_id = %s AND p.status <> 'archived'
GROUP BY p.id, p.code, p.name, p.description, p.status,
         p.created_at, p.updated_at, pm.role
"""


def _product_meta_response(row: dict) -> ProductMetaResponse:
    return ProductMetaResponse(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        description=row["description"],
        status=row["status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        current_user_role=row.get("current_user_role"),
        er_graph_count=row.get("er_graph_count") or 0,
        business_flow_count=row.get("business_flow_count") or 0,
        swimlane_component_count=row.get("swimlane_component_count") or 0,
    )


def _fetch_product_meta(cur, product_id: UUID, user_id: UUID) -> ProductMetaResponse:
    cur.execute(PRODUCT_META_SELECT, (product_id, user_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"product not found: {product_id}",
        )
    return _product_meta_response(row)


def _ensure_active_product(cur, product_id: UUID) -> None:
    cur.execute("SELECT status FROM product WHERE id = %s", (product_id,))
    row = cur.fetchone()
    if not row or row["status"] == "archived":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"product not found: {product_id}",
        )


def _owner_count(cur, product_id: UUID) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS n
        FROM product_member
        WHERE product_id = %s AND role = 'owner'
        """,
        (product_id,),
    )
    return int(cur.fetchone()["n"])


def _member_response(row: dict) -> ProductMemberResponse:
    return ProductMemberResponse(
        user_id=row["user_id"],
        email=row["email"],
        display_name=row["display_name"],
        role=row["role"],
        created_at=row["created_at"],
        is_creator=bool(row.get("is_creator")),
    )


def _fetch_product_member(
    cur,
    product_id: UUID,
    user_id: UUID,
) -> ProductMemberResponse:
    cur.execute(
        """
        SELECT m.user_id, u.email, u.display_name, m.role, m.created_at,
               (p.created_by = m.user_id::text) AS is_creator
        FROM product_member m
        JOIN app_user u ON u.id = m.user_id
        JOIN product p ON p.id = m.product_id
        WHERE m.product_id = %s AND m.user_id = %s
        """,
        (product_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="product member not found",
        )
    return _member_response(row)


@router.get("", response_model=list[ProductMetaResponse])
def list_products(
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[ProductMetaResponse]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT p.id, p.code, p.name, p.description, p.status,
                       p.created_at, p.updated_at,
                       pm.role AS current_user_role,
                       COUNT(DISTINCT g.id) AS er_graph_count,
                       COUNT(DISTINCT bf.id) AS business_flow_count,
                       COUNT(DISTINCT sc.id) AS swimlane_component_count
                FROM product p
                JOIN product_member pm ON pm.product_id = p.id
                LEFT JOIN er_graph g ON g.product_id = p.id AND g.status <> 'archived'
                LEFT JOIN business_flow bf ON bf.product_id = p.id AND bf.status <> 'ARCHIVED'
                LEFT JOIN swimlane_component sc
                  ON sc.product_id = p.id
                 AND sc.status <> 'ARCHIVED'
                 AND sc.deleted_at IS NULL
                WHERE pm.user_id = %s AND p.status <> 'archived'
                GROUP BY p.id, p.code, p.name, p.description, p.status,
                         p.created_at, p.updated_at, pm.role
                ORDER BY lower(p.name)
                """,
                (user.id,),
            )
            return [_product_meta_response(row) for row in cur.fetchall()]


@router.post("", response_model=ProductMetaResponse)
def create_product(
    body: ProductCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> ProductMetaResponse:
    code = body.code.strip()
    name = body.name.strip()
    if not code or not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="product code and name are required",
        )

    with db_transaction() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    INSERT INTO product (code, name, description, status, created_by, updated_at)
                    VALUES (%s, %s, %s, 'active', %s, NOW())
                    RETURNING id
                    """,
                    (code, name, body.description, str(user.id)),
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="product code already exists",
                ) from exc
            product_id = cur.fetchone()["id"]
            cur.execute(
                """
                INSERT INTO product_member (product_id, user_id, role)
                VALUES (%s, %s, 'owner')
                ON CONFLICT (product_id, user_id)
                DO UPDATE SET role = 'owner', updated_at = NOW()
                """,
                (product_id, user.id),
            )
            return _fetch_product_meta(cur, product_id, user.id)


@router.patch("/{product_id}", response_model=ProductMetaResponse)
def update_product(
    product_id: UUID,
    body: ProductUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> ProductMetaResponse:
    fields_set = body.model_fields_set
    updates: dict[str, str | None] = {}
    if "code" in fields_set and body.code is not None:
        updates["code"] = body.code.strip()
    if "name" in fields_set and body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="product name cannot be empty",
            )
        updates["name"] = name
    if "description" in fields_set:
        updates["description"] = (body.description or "").strip() or None
    if "status" in fields_set and body.status is not None:
        if body.status not in {"active", "archived"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid product status",
            )
        updates["status"] = body.status

    min_role: ProductRole = "owner" if updates.get("status") == "archived" else "editor"
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_product_role(cur, product_id, user.id, min_role)
            _ensure_active_product(cur, product_id)
            if updates:
                assignments = [f"{field} = %s" for field in updates]
                values = [*updates.values(), product_id]
                try:
                    cur.execute(
                        f"""
                        UPDATE product
                        SET {", ".join(assignments)}, updated_at = NOW()
                        WHERE id = %s AND status <> 'archived'
                        """,
                        values,
                    )
                except Exception as exc:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="product code already exists",
                    ) from exc
                if cur.rowcount == 0:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"product not found: {product_id}",
                    )
            return _fetch_product_meta(cur, product_id, user.id)


@router.delete("/{product_id}", response_model=ProductMetaResponse)
def archive_product(
    product_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> ProductMetaResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_product_role(cur, product_id, user.id, "owner")
            meta = _fetch_product_meta(cur, product_id, user.id)
            cur.execute(
                """
                UPDATE product
                SET status = 'archived', updated_at = NOW()
                WHERE id = %s AND status <> 'archived'
                """,
                (product_id,),
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"product not found: {product_id}",
                )
            return meta


@router.get("/{product_id}/members", response_model=list[ProductMemberResponse])
def list_product_members(
    product_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[ProductMemberResponse]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            ensure_product_role(cur, product_id, user.id, "owner")
            _ensure_active_product(cur, product_id)
            cur.execute(
                """
                SELECT m.user_id, u.email, u.display_name, m.role, m.created_at,
                       (p.created_by = m.user_id::text) AS is_creator
                FROM product_member m
                JOIN app_user u ON u.id = m.user_id
                JOIN product p ON p.id = m.product_id
                WHERE m.product_id = %s
                ORDER BY m.created_at ASC, lower(u.email)
                """,
                (product_id,),
            )
            return [_member_response(row) for row in cur.fetchall()]


@router.put("/{product_id}/members", response_model=ProductMemberResponse)
def upsert_product_member(
    product_id: UUID,
    body: ProductMemberUpsertRequest,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> ProductMemberResponse:
    email = body.email.strip().lower()
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_product_role(cur, product_id, user.id, "owner")
            _ensure_active_product(cur, product_id)
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
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="active user not found",
                )
            target_user_id = target["id"]
            cur.execute("SELECT created_by FROM product WHERE id = %s", (product_id,))
            product = cur.fetchone()
            if product and product["created_by"] == str(target_user_id) and body.role != "owner":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="product creator must remain owner",
                )
            cur.execute(
                """
                SELECT role
                FROM product_member
                WHERE product_id = %s AND user_id = %s
                """,
                (product_id, target_user_id),
            )
            existing = cur.fetchone()
            if (
                existing
                and existing["role"] == "owner"
                and body.role != "owner"
                and _owner_count(cur, product_id) <= 1
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot demote the last owner",
                )
            cur.execute(
                """
                INSERT INTO product_member (product_id, user_id, role)
                VALUES (%s, %s, %s)
                ON CONFLICT (product_id, user_id)
                DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
                """,
                (product_id, target_user_id, body.role),
            )
            return _fetch_product_member(cur, product_id, target_user_id)


@router.delete("/{product_id}/members/{member_user_id}", response_model=ProductMemberResponse)
def remove_product_member(
    product_id: UUID,
    member_user_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> ProductMemberResponse:
    with db_transaction() as conn:
        with conn.cursor() as cur:
            ensure_product_role(cur, product_id, user.id, "owner")
            _ensure_active_product(cur, product_id)
            member = _fetch_product_member(cur, product_id, member_user_id)
            if member.is_creator:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="product creator cannot be removed",
                )
            if member.role == "owner" and _owner_count(cur, product_id) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot remove the last owner",
                )
            cur.execute(
                """
                DELETE FROM product_member
                WHERE product_id = %s AND user_id = %s
                """,
                (product_id, member_user_id),
            )
            return member
