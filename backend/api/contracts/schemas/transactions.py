"""
Contract schemas for /transactions/* endpoints.

Transaction-level analysis for price growth and appreciation metrics.

Endpoints:
- GET /api/transactions/price-growth
- GET /api/transactions/price-growth/segments
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
from ..pydantic_models.transactions import PriceGrowthParams, SegmentsParams


# =============================================================================
# /transactions/price-growth
# =============================================================================

PRICE_GROWTH_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "transactionId": FieldSpec(name="transactionId", type=int, required=False),
        "project": FieldSpec(name="project", type=str, required=False),
        "bedroomCount": FieldSpec(name="bedroomCount", type=int, required=False),
        "floorLevel": FieldSpec(name="floorLevel", type=str, required=False),
        "transactionDate": FieldSpec(name="transactionDate", type=str, required=False),
        "price": FieldSpec(name="price", type=float, required=False),
        "psf": FieldSpec(name="psf", type=float, required=False),
        "cumulativeGrowthPct": FieldSpec(name="cumulativeGrowthPct", type=float, nullable=True),
        "incrementalGrowthPct": FieldSpec(name="incrementalGrowthPct", type=float, nullable=True),
        "daysSincePrevious": FieldSpec(name="daysSincePrevious", type=int, nullable=True),
        "annualizedGrowthPct": FieldSpec(name="annualizedGrowthPct", type=float, nullable=True),
    },
    meta_fields=make_meta_fields(
        FieldSpec(name="page", type=int, required=False),
        FieldSpec(name="perPage", type=int, required=False),
        FieldSpec(name="totalRecords", type=int, required=False),
        FieldSpec(name="totalPages", type=int, required=False),
    ),
    required_meta=make_required_meta(),
    data_is_list=True,
)

PRICE_GROWTH_CONTRACT = EndpointContract(
    endpoint="transactions/price-growth",
    version="v3",
    pydantic_model=PriceGrowthParams,
    response_schema=PRICE_GROWTH_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PRICE_GROWTH_CONTRACT)


# =============================================================================
# /transactions/price-growth/segments
# =============================================================================

SEGMENTS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "project": FieldSpec(name="project", type=str, required=False),
        "bedroomCount": FieldSpec(name="bedroomCount", type=int, required=False),
        "floorLevel": FieldSpec(name="floorLevel", type=str, required=False),
        "transactionCount": FieldSpec(name="transactionCount", type=int, required=False),
        "avgCumulativeGrowthPct": FieldSpec(name="avgCumulativeGrowthPct", type=float, nullable=True),
        "avgAnnualizedGrowthPct": FieldSpec(name="avgAnnualizedGrowthPct", type=float, nullable=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=True,
)

SEGMENTS_CONTRACT = EndpointContract(
    endpoint="transactions/price-growth/segments",
    version="v3",
    pydantic_model=SegmentsParams,
    response_schema=SEGMENTS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(SEGMENTS_CONTRACT)
