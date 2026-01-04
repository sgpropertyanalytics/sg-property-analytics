"""
Contract schemas for /supply/* endpoints.

Supply Pipeline endpoints for waterfall visualization.

Endpoints:
- GET /api/supply/summary
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
from ..pydantic_models import SupplySummaryParams


# =============================================================================
# /supply/summary
# =============================================================================

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
    pydantic_model=SupplySummaryParams,
    response_schema=SUPPLY_SUMMARY_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(SUPPLY_SUMMARY_CONTRACT)
