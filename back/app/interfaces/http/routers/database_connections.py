from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.application.database_connection_service import database_connection_service
from app.application.schema_preview_service import schema_preview_service
from app.database import db_transaction, get_connection
from app.domain.database_connection import DatabaseConnection, DatabaseType
from app.interfaces.http.schemas.database_connection import (
    ConnectionTestResponse,
    DatabaseConnectionCreate,
    DatabaseConnectionResponse,
    DatabaseConnectionUpdate,
    SchemaPreviewRequest,
    SchemaPreviewResponse,
    TablePreviewResponse,
)
from app.services.auth import AuthenticatedUser, get_current_user_from_header

router = APIRouter(prefix="/database-connections", tags=["database-connections"])


def _to_response(conn: DatabaseConnection) -> DatabaseConnectionResponse:
    return DatabaseConnectionResponse(**conn.masked())


def _from_create(body: DatabaseConnectionCreate) -> DatabaseConnection:
    return DatabaseConnection(
        id=None,
        connection_key=body.connection_key or "",
        name=body.name,
        db_type=DatabaseType(body.db_type),
        host=body.host,
        port=body.port,
        database_name=body.database_name,
        schema_name=body.schema_name,
        username=body.username,
        password=body.password,
        status=body.status,
    )


def _from_update(body: DatabaseConnectionUpdate) -> DatabaseConnection:
    return DatabaseConnection(
        id=None,
        connection_key="",
        name=body.name,
        db_type=DatabaseType(body.db_type),
        host=body.host,
        port=body.port,
        database_name=body.database_name,
        schema_name=body.schema_name,
        username=body.username,
        password=body.password,
        status=body.status,
    )


@router.get("", response_model=list[DatabaseConnectionResponse])
def list_database_connections(
    _user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> list[DatabaseConnectionResponse]:
    with get_connection() as conn:
        return [_to_response(item) for item in database_connection_service.list_connections(conn)]


@router.post("", response_model=DatabaseConnectionResponse)
def create_database_connection(
    body: DatabaseConnectionCreate,
    _user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> DatabaseConnectionResponse:
    try:
        with db_transaction() as conn:
            created = database_connection_service.create_connection(conn, _from_create(body))
            return _to_response(created)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/{connection_id}", response_model=DatabaseConnectionResponse)
def update_database_connection(
    connection_id: UUID,
    body: DatabaseConnectionUpdate,
    _user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> DatabaseConnectionResponse:
    try:
        with db_transaction() as conn:
            updated = database_connection_service.update_connection(conn, connection_id, _from_update(body))
            return _to_response(updated)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{connection_id}/test", response_model=ConnectionTestResponse)
def test_database_connection(
    connection_id: UUID,
    _user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> ConnectionTestResponse:
    try:
        with get_connection() as conn:
            database_connection_service.test_connection(conn, connection_id)
        return ConnectionTestResponse()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{connection_id}/preview", response_model=SchemaPreviewResponse)
def preview_database_connection(
    connection_id: UUID,
    _body: SchemaPreviewRequest | None = None,
    _user: AuthenticatedUser = Depends(get_current_user_from_header),
) -> SchemaPreviewResponse:
    try:
        with get_connection() as conn:
            tables = schema_preview_service.preview_tables(conn, connection_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SchemaPreviewResponse(
        connection_id=connection_id,
        tables=[
            TablePreviewResponse(
                table_name=item.table_name,
                comment=item.comment,
                column_count=item.column_count,
            )
            for item in tables
        ],
    )
