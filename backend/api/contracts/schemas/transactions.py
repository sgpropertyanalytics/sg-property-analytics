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

# Data item fields (camelCase, matching PriceGrowthItem Pydantic model)
PRICE_GROWTH_ITEM_FIELDS = {
    "transactionId": FieldSpec(name="transactionId", type=int, required=True),
    "project": FieldSpec(name="project", type=str, required=True),
    "bedroomCount": FieldSpec(name="bedroomCount", type=int, required=True),
    "floorLevel": FieldSpec(name="floorLevel", type=str, required=True),
    "transactionDate": FieldSpec(name="transactionDate", type=str, required=True),
    "psf": FieldSpec(name="psf", type=float, nullable=True),
    "txnSequence": FieldSpec(name="txnSequence", type=int, required=True),
    "cumulativeGrowthPct": FieldSpec(name="cumulativeGrowthPct", type=float, nullable=True),
    "incrementalGrowthPct": FieldSpec(name="incrementalGrowthPct", type=float, nullable=True),
    "daysSincePrevious": FieldSpec(name="daysSincePrevious", type=int, nullable=True),
    "annualizedGrowthPct": FieldSpec(name="annualizedGrowthPct", type=float, nullable=True),
}

PRICE_GROWTH_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "transactionId": FieldSpec(name="transactionId", type=int, required=True),
        "project": FieldSpec(name="project", type=str, required=True),
        "bedroomCount": FieldSpec(name="bedroomCount", type=int, required=True),
        "floorLevel": FieldSpec(name="floorLevel", type=str, required=True),
        "transactionDate": FieldSpec(name="transactionDate", type=str, required=True),
        "psf": FieldSpec(name="psf", type=float, nullable=True),
        "txnSequence": FieldSpec(name="txnSequence", type=int, required=True),
        "cumulativeGrowthPct": FieldSpec(name="cumulativeGrowthPct", type=float, nullable=True),
        "incrementalGrowthPct": FieldSpec(name="incrementalGrowthPct", type=float, nullable=True),
        "daysSincePrevious": FieldSpec(name="daysSincePrevious", type=int, nullable=True),
        "annualizedGrowthPct": FieldSpec(name="annualizedGrowthPct", type=float, nullable=True),
    },
    meta_fields=make_meta_fields(
        # Pagination fields (camelCase, matching PriceGrowthPagination model)
        FieldSpec(name="page", type=int, required=True),
        FieldSpec(name="perPage", type=int, required=True),
        FieldSpec(name="totalRecords", type=int, required=True),
        FieldSpec(name="totalPages", type=int, required=True),
        FieldSpec(name="hasNext", type=bool, required=True),
        FieldSpec(name="hasPrev", type=bool, required=True),
        # Response also includes filtersApplied at top level
        FieldSpec(name="filtersApplied", type=dict, required=False),
    ),
    required_meta=make_required_meta("page", "perPage", "totalRecords", "totalPages"),
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

# Segment item fields (camelCase, matching SegmentSummaryItem Pydantic model)
SEGMENT_SUMMARY_ITEM_FIELDS = {
    "project": FieldSpec(name="project", type=str, required=True),
    "bedroomCount": FieldSpec(name="bedroomCount", type=int, required=True),
    "floorLevel": FieldSpec(name="floorLevel", type=str, required=True),
    "transactionCount": FieldSpec(name="transactionCount", type=int, required=True),
    "avgCumulativeGrowthPct": FieldSpec(name="avgCumulativeGrowthPct", type=float, nullable=True),
    "avgIncrementalGrowthPct": FieldSpec(name="avgIncrementalGrowthPct", type=float, nullable=True),
    "avgDaysBetweenTxn": FieldSpec(name="avgDaysBetweenTxn", type=int, nullable=True),
    "minCumulativeGrowthPct": FieldSpec(name="minCumulativeGrowthPct", type=float, nullable=True),
    "maxCumulativeGrowthPct": FieldSpec(name="maxCumulativeGrowthPct", type=float, nullable=True),
}

SEGMENTS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "project": FieldSpec(name="project", type=str, required=True),
        "bedroomCount": FieldSpec(name="bedroomCount", type=int, required=True),
        "floorLevel": FieldSpec(name="floorLevel", type=str, required=True),
        "transactionCount": FieldSpec(name="transactionCount", type=int, required=True),
        "avgCumulativeGrowthPct": FieldSpec(name="avgCumulativeGrowthPct", type=float, nullable=True),
        "avgIncrementalGrowthPct": FieldSpec(name="avgIncrementalGrowthPct", type=float, nullable=True),
        "avgDaysBetweenTxn": FieldSpec(name="avgDaysBetweenTxn", type=int, nullable=True),
        "minCumulativeGrowthPct": FieldSpec(name="minCumulativeGrowthPct", type=float, nullable=True),
        "maxCumulativeGrowthPct": FieldSpec(name="maxCumulativeGrowthPct", type=float, nullable=True),
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
