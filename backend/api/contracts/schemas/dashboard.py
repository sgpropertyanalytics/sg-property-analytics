"""
Contract schema for /dashboard endpoint.

Unified dashboard endpoint that returns multiple chart panels in one response.

Endpoint: GET/POST /api/dashboard
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
from ..pydantic_models.dashboard import DashboardParams


# =============================================================================
# RESPONSE SCHEMA - What endpoint returns
# =============================================================================

# Dashboard response contains multiple optional panels.
# Each panel is declared here for bidirectional validation in STRICT mode.
# Panel contents are not deeply validated - just existence and type.
DASHBOARD_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # All valid panels - each is optional (depends on panels param)
        # Types: list for array-based panels, dict for object-based panels
        "time_series": FieldSpec(name="time_series", type=list, required=False),
        "volume_by_location": FieldSpec(name="volume_by_location", type=list, required=False),
        "price_histogram": FieldSpec(name="price_histogram", type=dict, required=False),
        "bedroom_mix": FieldSpec(name="bedroom_mix", type=list, required=False),
        "summary": FieldSpec(name="summary", type=dict, required=False),
        "sale_type_breakdown": FieldSpec(name="sale_type_breakdown", type=list, required=False),
        "beads_chart": FieldSpec(name="beads_chart", type=list, required=False),
    },
    # Use make_meta_fields() for base meta + endpoint-specific fields
    # Note: field names must match serializer output (camelCase)
    meta_fields=make_meta_fields(
        FieldSpec(name="cacheHit", type=bool, required=False),
        FieldSpec(name="filtersApplied", type=dict, required=True),
        FieldSpec(name="totalRecordsMatched", type=int, required=False),
        FieldSpec(name="dataMasked", type=bool, required=False),  # camelCase
        FieldSpec(name="filterNotes", type=dict, required=False),
        FieldSpec(name="options", type=dict, required=False),
        FieldSpec(name="panelsReturned", type=list, required=False),
    ),
    required_meta=make_required_meta(),
    data_is_list=False,  # Dashboard data is an object with panel keys
)


# =============================================================================
# REGISTER CONTRACT
# =============================================================================

DASHBOARD_CONTRACT = EndpointContract(
    endpoint="dashboard",
    version="v3",
    response_schema=DASHBOARD_RESPONSE_SCHEMA,
    pydantic_model=DashboardParams,
    serializer=None,  # Uses existing serialize_dashboard_response in route
    mode=SchemaMode.WARN,
)

# Register on import
register_contract(DASHBOARD_CONTRACT)
