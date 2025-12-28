"""
Contract schema for /filter-options endpoint.

Returns available filter values for frontend dropdowns.

Endpoint: GET /api/filter-options
"""

from ..registry import (
    EndpointContract,
    ParamSchema,
    ServiceBoundarySchema,
    ResponseSchema,
    FieldSpec,
    register_contract,
    SchemaMode,
)


# =============================================================================
# PARAM SCHEMA - What frontend sends
# =============================================================================

FILTER_OPTIONS_PARAM_SCHEMA = ParamSchema(
    fields={
        "schema": FieldSpec(
            name="schema",
            type=str,
            default="v1",
            allowed_values=["v1", "v2"],
            description="Response schema version (v2 = camelCase only)"
        ),
    },
    aliases={}
)


# =============================================================================
# SERVICE BOUNDARY SCHEMA - What service receives after normalization
# =============================================================================

FILTER_OPTIONS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "schema": FieldSpec(name="schema", type=str, default="v1"),
    }
)


# =============================================================================
# RESPONSE SCHEMA - What endpoint returns
# =============================================================================

FILTER_OPTIONS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # Response is a flat object, not data[]
        "districts": FieldSpec(name="districts", type=list, required=True),
        "regions": FieldSpec(name="regions", type=dict, required=True),
        "bedrooms": FieldSpec(name="bedrooms", type=list, required=True),
        "saleTypes": FieldSpec(name="saleTypes", type=list, required=True),
        "projects": FieldSpec(name="projects", type=list, required=True),
        "dateRange": FieldSpec(name="dateRange", type=dict, required=True),
        "psfRange": FieldSpec(name="psfRange", type=dict, required=True),
        "sizeRange": FieldSpec(name="sizeRange", type=dict, required=True),
        "tenures": FieldSpec(name="tenures", type=list, required=True),
        "propertyAgeBuckets": FieldSpec(name="propertyAgeBuckets", type=list, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,  # Response is flat object with filter options
)


# =============================================================================
# REGISTER CONTRACT
# =============================================================================

FILTER_OPTIONS_CONTRACT = EndpointContract(
    endpoint="filter-options",
    version="v3",
    param_schema=FILTER_OPTIONS_PARAM_SCHEMA,
    service_schema=FILTER_OPTIONS_SERVICE_SCHEMA,
    response_schema=FILTER_OPTIONS_RESPONSE_SCHEMA,
    compat_map=None,
    serializer=None,
    mode=SchemaMode.WARN,
)

# Register on import
register_contract(FILTER_OPTIONS_CONTRACT)
