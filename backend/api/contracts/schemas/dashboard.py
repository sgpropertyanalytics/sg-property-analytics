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

# Dashboard response is complex: data contains multiple panels
# We validate meta fields but allow flexible panel data
DASHBOARD_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # Each panel is optional - depends on panels param
        # We don't strictly validate panel contents
    },
    # Use make_meta_fields() for base meta + endpoint-specific fields
    meta_fields=make_meta_fields(
        FieldSpec(name="cacheHit", type=bool, required=False),
        FieldSpec(name="filtersApplied", type=dict, required=True),
        FieldSpec(name="totalRecordsMatched", type=int, required=False),
        FieldSpec(name="data_masked", type=bool, required=False),
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
