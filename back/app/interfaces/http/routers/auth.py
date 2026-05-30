from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.database import db_transaction, get_connection
from app.interfaces.http.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UserResponse,
)
from app.services.auth import (
    AuthenticatedUser,
    create_access_token,
    get_current_user_from_header,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_response(user: AuthenticatedUser) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, display_name=user.display_name)


@router.post("/register", response_model=AuthResponse)
def register(body: RegisterRequest) -> AuthResponse:
    email = body.email.lower()
    settings = get_settings()
    default_graph = UUID(settings.default_graph_id)
    with db_transaction() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM app_user")
            first_user = int(cur.fetchone()["n"]) == 0
            try:
                cur.execute(
                    """
                    INSERT INTO app_user (email, display_name, password_hash)
                    VALUES (%s, %s, %s)
                    RETURNING id, email, display_name
                    """,
                    (email, body.display_name.strip(), hash_password(body.password)),
                )
            except Exception as exc:
                raise HTTPException(status_code=409, detail="email already registered") from exc
            row = cur.fetchone()
            role = "owner" if first_user else "editor"
            cur.execute(
                """
                INSERT INTO er_graph_member (graph_id, user_id, role)
                VALUES (%s, %s, %s)
                ON CONFLICT (graph_id, user_id) DO UPDATE SET role = EXCLUDED.role
                """,
                (default_graph, row["id"], role),
            )
    user = AuthenticatedUser(id=row["id"], email=row["email"], display_name=row["display_name"])
    return AuthResponse(access_token=create_access_token(user), user=_user_response(user))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest) -> AuthResponse:
    email = body.email.lower()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, display_name, password_hash, status
                FROM app_user WHERE email = %s
                """,
                (email,),
            )
            row = cur.fetchone()
    if not row or row["status"] != "active" or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid email or password")
    user = AuthenticatedUser(id=row["id"], email=row["email"], display_name=row["display_name"])
    return AuthResponse(access_token=create_access_token(user), user=_user_response(user))


@router.get("/me", response_model=UserResponse)
def me(user: AuthenticatedUser = Depends(get_current_user_from_header)) -> UserResponse:
    return _user_response(user)
