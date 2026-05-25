RELATIONSHIP_TO_CARDINALITY = {
    "1:1": "one_to_one",
    "1:N": "one_to_many",
    "N:1": "many_to_one",
    "N:N": "many_to_many",
    "N:M": "many_to_many",
}


def relationship_to_cardinality(relationship: str | None) -> str | None:
    if not relationship:
        return None
    return RELATIONSHIP_TO_CARDINALITY.get(relationship, relationship)
