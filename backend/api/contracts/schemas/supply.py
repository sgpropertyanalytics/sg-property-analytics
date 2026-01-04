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
    make_meta_fields,
    make_required_meta,
)
from ..pydantic_models import SupplySummaryParams


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
        "byRegion": FieldSpec(name="byRegion", type=dict, required=False),
        "byDistrict": FieldSpec(name="byDistrict", type=dict, required=False),
        "totals": FieldSpec(name="totals", type=dict, required=False),
        "meta": FieldSpec(name="meta", type=dict, required=False),
    },
    meta_fields=make_meta_fields(
        FieldSpec(name="launchYear", type=int, required=False),
        FieldSpec(name="includeGls", type=bool, required=False),
        FieldSpec(name="computedAs", type=str, required=False),
        FieldSpec(name="asOfDate", type=str, required=False),
        FieldSpec(name="warnings", type=list, required=False),
    ),
    required_meta=make_required_meta(),
    data_is_list=False,
)

SUPPLY_SUMMARY_CONTRACT = EndpointContract(
    endpoint="supply/summary",
    version="v3",
    param_schema=SUPPLY_SUMMARY_PARAM_SCHEMA,
    service_schema=SUPPLY_SUMMARY_SERVICE_SCHEMA,
    response_schema=SUPPLY_SUMMARY_RESPONSE_SCHEMA,
    pydantic_model=SupplySummaryParams,
    mode=SchemaMode.WARN,
)

register_contract(SUPPLY_SUMMARY_CONTRACT)
