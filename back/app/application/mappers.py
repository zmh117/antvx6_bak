"""HTTP DTO 与领域对象之间的映射。"""

from __future__ import annotations

from app.domain.er.models import (
    BusinessPath,
    CanvasSnapshot,
    Column,
    EntityDiff,
    EnumValue,
    GraphChanges,
    GraphPayload,
    GraphState,
    Relation,
    Table,
)
from app.schemas.graph import (
    BusinessPathPayload,
    CanvasSnapshotPayload,
    ColumnPayload,
    EntityDiff as DtoEntityDiff,
    EnumValuePayload,
    GraphChangesPayload,
    NormalizedGraphPayload,
    RelationPayload,
    TablePayload,
)


def _table_from_dto(t: TablePayload) -> Table:
    return Table(
        table_key=t.table_key,
        table_name=t.table_name,
        business_name=t.business_name,
        description=t.description,
        business_domain=t.business_domain,
        table_type=t.table_type,
        importance=t.importance,
        tags=list(t.tags),
        comment=t.comment,
        x=t.x,
        y=t.y,
        width=t.width,
        height=t.height,
        raw_data=dict(t.raw_data),
    )


def _column_from_dto(c: ColumnPayload) -> Column:
    return Column(
        table_key=c.table_key,
        column_key=c.column_key,
        column_name=c.column_name,
        data_type=c.data_type,
        business_name=c.business_name,
        description=c.description,
        comment=c.comment,
        default_value=c.default_value,
        nullable=c.nullable,
        is_primary_key=c.is_primary_key,
        is_unique=c.is_unique,
        is_indexed=c.is_indexed,
        key_type=c.key_type,
        column_role=c.column_role,
        enum_enabled=c.enum_enabled,
        sort_order=c.sort_order,
        tags=list(c.tags),
        raw_data=dict(c.raw_data),
    )


def _enum_from_dto(e: EnumValuePayload) -> EnumValue:
    return EnumValue(
        table_key=e.table_key,
        column_key=e.column_key,
        value=e.value,
        label=e.label,
        description=e.description,
        sort_order=e.sort_order,
        enabled=e.enabled,
        raw_data=dict(e.raw_data),
    )


def _relation_from_dto(r: RelationPayload) -> Relation:
    return Relation(
        relation_key=r.relation_key,
        source_table_key=r.source_table_key,
        source_column_key=r.source_column_key,
        target_table_key=r.target_table_key,
        target_column_key=r.target_column_key,
        relation_type=r.relation_type,
        relationship=r.relationship,
        cardinality=r.cardinality,
        relation_name=r.relation_name,
        description=r.description,
        join_condition=r.join_condition,
        direction=r.direction,
        confidence=r.confidence,
        source=r.source,
        verified=r.verified,
        tags=list(r.tags),
        raw_edge=dict(r.raw_edge),
    )


def _path_from_dto(p: BusinessPathPayload) -> BusinessPath:
    return BusinessPath(
        path_key=p.path_key,
        name=p.name,
        intent=p.intent,
        description=p.description,
        business_domain=p.business_domain,
        tags=list(p.tags),
        table_keys=list(p.table_keys),
        relation_keys=list(p.relation_keys),
        path_json=dict(p.path_json),
        confidence=p.confidence,
    )


def payload_from_dto(dto: NormalizedGraphPayload) -> GraphPayload:
    snap = dto.snapshot or CanvasSnapshotPayload()
    return GraphPayload(
        graph_id=dto.graph_id,
        base_version=dto.base_version,
        client_id=dto.client_id,
        operation_source=dto.operation_source,
        tables=[_table_from_dto(t) for t in dto.tables],
        columns=[_column_from_dto(c) for c in dto.columns],
        enums=[_enum_from_dto(e) for e in dto.enums],
        relations=[_relation_from_dto(r) for r in dto.relations],
        business_paths=[_path_from_dto(p) for p in dto.business_paths],
        snapshot=CanvasSnapshot(nodes=list(snap.nodes), edges=list(snap.edges)),
        legacy_tables=list(dto.legacy_tables) if dto.legacy_tables else None,
    )


def state_from_loader(state: GraphState) -> GraphState:
    return state


def _entity_diff_to_dto(diff: EntityDiff) -> DtoEntityDiff:
    return DtoEntityDiff(added=list(diff.added), updated=list(diff.updated), deleted=list(diff.deleted))


def changes_to_dto(changes: GraphChanges) -> GraphChangesPayload:
    snap = None
    if changes.snapshot:
        snap = CanvasSnapshotPayload(nodes=changes.snapshot.nodes, edges=changes.snapshot.edges)
    return GraphChangesPayload(
        tables=_entity_diff_to_dto(changes.tables),
        columns=_entity_diff_to_dto(changes.columns),
        enums=_entity_diff_to_dto(changes.enums),
        relations=_entity_diff_to_dto(changes.relations),
        business_paths=_entity_diff_to_dto(changes.business_paths),
        snapshot=snap,
    )


def changes_from_dto(dto: GraphChangesPayload) -> GraphChanges:
    snap = None
    if dto.snapshot:
        snap = CanvasSnapshot(nodes=list(dto.snapshot.nodes), edges=list(dto.snapshot.edges))
    return GraphChanges(
        tables=EntityDiff(
            added=list(dto.tables.added),
            updated=list(dto.tables.updated),
            deleted=list(dto.tables.deleted),
        ),
        columns=EntityDiff(
            added=list(dto.columns.added),
            updated=list(dto.columns.updated),
            deleted=list(dto.columns.deleted),
        ),
        enums=EntityDiff(
            added=list(dto.enums.added),
            updated=list(dto.enums.updated),
            deleted=list(dto.enums.deleted),
        ),
        relations=EntityDiff(
            added=list(dto.relations.added),
            updated=list(dto.relations.updated),
            deleted=list(dto.relations.deleted),
        ),
        business_paths=EntityDiff(
            added=list(dto.business_paths.added),
            updated=list(dto.business_paths.updated),
            deleted=list(dto.business_paths.deleted),
        ),
        snapshot=snap,
    )
