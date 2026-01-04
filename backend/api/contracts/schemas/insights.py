"""
Contract schemas for /insights/* endpoints.

Visual Analytics endpoints for the Insights page.

Endpoints:
- GET /api/insights/district-psf
- GET /api/insights/district-liquidity
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
from ..pydantic_models.insights import DistrictPsfParams, DistrictLiquidityParams


# =============================================================================
# /insights/district-psf
# =============================================================================

DISTRICT_PSF_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields=make_meta_fields(
        FieldSpec(name="period", type=str, required=False),
        FieldSpec(name="bed_filter", type=str, required=False),
        FieldSpec(name="total_districts", type=int, required=False),
        FieldSpec(name="districts_with_data", type=int, required=False),
    ),
    required_meta=make_required_meta(),
    data_is_list=False,
)

DISTRICT_PSF_CONTRACT = EndpointContract(
    endpoint="insights/district-psf",
    version="v3",
    pydantic_model=DistrictPsfParams,
    response_schema=DISTRICT_PSF_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(DISTRICT_PSF_CONTRACT)


# =============================================================================
# /insights/district-liquidity
# =============================================================================

DISTRICT_LIQUIDITY_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields=make_meta_fields(
        FieldSpec(name="period", type=str, required=False),
        FieldSpec(name="months_in_period", type=int, required=False),
        FieldSpec(name="total_transactions", type=int, required=False),
        FieldSpec(name="mean_velocity", type=float, required=False),
    ),
    required_meta=make_required_meta(),
    data_is_list=False,
)

DISTRICT_LIQUIDITY_CONTRACT = EndpointContract(
    endpoint="insights/district-liquidity",
    version="v3",
    pydantic_model=DistrictLiquidityParams,
    response_schema=DISTRICT_LIQUIDITY_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(DISTRICT_LIQUIDITY_CONTRACT)
