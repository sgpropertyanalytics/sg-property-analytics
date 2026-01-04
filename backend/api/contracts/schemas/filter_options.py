"""
Contract schema for /filter-options endpoint.

Returns available filter values for frontend dropdowns.

Endpoint: GET /api/filter-options
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
from ..pydantic_models.filter_options import FilterOptionsParams


# =============================================================================
# RESPONSE SCHEMA - What endpoint returns
# =============================================================================

FILTER_OPTIONS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "districts": FieldSpec(name="districts", type=list, required=True),
        "regions": FieldSpec(name="regions", type=list, required=True),
        "bedrooms": FieldSpec(name="bedrooms", type=list, required=True),
        "saleTypes": FieldSpec(name="saleTypes", type=list, required=True),
        "projects": FieldSpec(name="projects", type=list, required=True),
        "dateRange": FieldSpec(name="dateRange", type=dict, required=True),
        "psfRange": FieldSpec(name="psfRange", type=dict, required=True),
        "sizeRange": FieldSpec(name="sizeRange", type=dict, required=True),
        "tenures": FieldSpec(name="tenures", type=list, required=True),
        "propertyAgeBuckets": FieldSpec(name="propertyAgeBuckets", type=list, required=True),
        "marketSegments": FieldSpec(name="marketSegments", type=list, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)


# =============================================================================
# REGISTER CONTRACT
# =============================================================================

FILTER_OPTIONS_CONTRACT = EndpointContract(
    endpoint="filter-options",
    version="v3",
    pydantic_model=FilterOptionsParams,
    response_schema=FILTER_OPTIONS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(FILTER_OPTIONS_CONTRACT)
