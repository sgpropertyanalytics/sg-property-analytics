"""
Contract schemas for /supply/* endpoints.

Supply Pipeline endpoints for waterfall visualization.

Endpoints:
- GET /api/supply/summary
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
# /supply/summary
# =============================================================================

SUPPLY_SUMMARY_PARAM_SCHEMA = ParamSchema(
    fields={
        "includeGls": FieldSpec(
            name="includeGls",
            type=bool,
            default=True,
            description="Include GLS pipeline in totals"
        ),
        "launchYear": FieldSpec(
            name="launchYear",
            type=int,
            default=2026,
            description="Year filter for upcoming launches (2020-2035)"
        ),
    },
    aliases={
        "include_gls": "includeGls",
        "launch_year": "launchYear",
    }
)

SUPPLY_SUMMARY_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "include_gls": FieldSpec(name="include_gls", type=bool, default=True),
        "launch_year": FieldSpec(name="launch_year", type=int, default=2026),
    }
)

SUPPLY_SUMMARY_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # Response has byRegion, byDistrict, totals, meta at top level
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
        "launchYear": FieldSpec(name="launchYear", type=int, required=False),
        "includeGls": FieldSpec(name="includeGls", type=bool, required=False),
        "computedAs": FieldSpec(name="computedAs", type=str, required=False),
        "asOfDate": FieldSpec(name="asOfDate", type=str, required=False),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

SUPPLY_SUMMARY_CONTRACT = EndpointContract(
    endpoint="supply/summary",
    version="v3",
    param_schema=SUPPLY_SUMMARY_PARAM_SCHEMA,
    service_schema=SUPPLY_SUMMARY_SERVICE_SCHEMA,
    response_schema=SUPPLY_SUMMARY_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(SUPPLY_SUMMARY_CONTRACT)
