"""
Contract schemas for trend endpoints.

Active endpoint:
- GET /api/new-vs-resale
"""

from ..registry import (
    EndpointContract,
    ResponseSchema,
    FieldSpec,
    register_contract,
    SchemaMode,
    make_meta_fields,
    make_required_meta,
)
from ..pydantic_models import NewVsResaleParams


# =============================================================================
# /new-vs-resale
# =============================================================================

NEW_VS_RESALE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "chartData": FieldSpec(name="chartData", type=list, required=False),
        "summary": FieldSpec(name="summary", type=dict, required=False),
        "appliedFilters": FieldSpec(name="appliedFilters", type=dict, required=False),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

NEW_VS_RESALE_CONTRACT = EndpointContract(
    endpoint="trends/new-vs-resale",
    version="v3",
    pydantic_model=NewVsResaleParams,
    response_schema=NEW_VS_RESALE_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(NEW_VS_RESALE_CONTRACT)
