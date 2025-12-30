"""
Contract schemas for /transactions/* endpoints.

Transaction-level analysis for price growth and appreciation metrics.

Endpoints:
- GET /api/transactions/price-growth
- GET /api/transactions/price-growth/segments
"""

from datetime import date

from schemas.api_contract import SaleType, FloorLevel
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
# /transactions/price-growth
# =============================================================================

PRICE_GROWTH_PARAM_SCHEMA = ParamSchema(
    fields={
        # Filters
        "project": FieldSpec(
            name="project",
            type=str,
            nullable=True,
            description="Project name (partial match)"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=int,
            nullable=True,
            description="Bedroom count (1-5)"
        ),
        "floor_level": FieldSpec(
            name="floor_level",
            type=str,
            nullable=True,
            allowed_values=FloorLevel.ALL + [FloorLevel.UNKNOWN],
            description="Floor tier (low, mid_low, mid, mid_high, high, luxury, unknown)"
        ),
        "district": FieldSpec(
            name="district",
            type=str,
            nullable=True,
            description="District code (D01-D28)"
        ),
        "sale_type": FieldSpec(
            name="sale_type",
            type=str,
            nullable=True,
            allowed_values=SaleType.ALL,
            description="Sale type (new_sale, resale, sub_sale)"
        ),
        "date_from": FieldSpec(
            name="date_from",
            type=date,
            nullable=True,
            description="Start date (YYYY-MM-DD)"
        ),
        "date_to": FieldSpec(
            name="date_to",
            type=date,
            nullable=True,
            description="End date (YYYY-MM-DD)"
        ),

        # Pagination
        "page": FieldSpec(
            name="page",
            type=int,
            default=1,
            description="Page number"
        ),
        "per_page": FieldSpec(
            name="per_page",
            type=int,
            default=50,
            description="Records per page (max 500)"
        ),

    },
    aliases={
        "saleType": "sale_type",
        "dateFrom": "date_from",
        "dateTo": "date_to",
        "floorLevel": "floor_level",
        "perPage": "per_page",
    }
)

PRICE_GROWTH_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project": FieldSpec(name="project", type=str, nullable=True),
        "bedroom": FieldSpec(name="bedroom", type=int, nullable=True),
        "floor_level": FieldSpec(name="floor_level", type=str, nullable=True),
        "district": FieldSpec(name="district", type=str, nullable=True),
        "sale_type": FieldSpec(name="sale_type", type=str, nullable=True),
        "date_from": FieldSpec(name="date_from", type=date, nullable=True),
        "date_to": FieldSpec(name="date_to", type=date, nullable=True),
        "page": FieldSpec(name="page", type=int, default=1),
        "per_page": FieldSpec(name="per_page", type=int, default=50),
        
    }
)

PRICE_GROWTH_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # Transaction fields
        "transactionId": FieldSpec(name="transactionId", type=int, required=False),
        "project": FieldSpec(name="project", type=str, required=False),
        "bedroomCount": FieldSpec(name="bedroomCount", type=int, required=False),
        "floorLevel": FieldSpec(name="floorLevel", type=str, required=False),
        "transactionDate": FieldSpec(name="transactionDate", type=str, required=False),
        "price": FieldSpec(name="price", type=float, required=False),
        "psf": FieldSpec(name="psf", type=float, required=False),
        # Growth metrics
        "cumulativeGrowthPct": FieldSpec(name="cumulativeGrowthPct", type=float, nullable=True),
        "incrementalGrowthPct": FieldSpec(name="incrementalGrowthPct", type=float, nullable=True),
        "daysSincePrevious": FieldSpec(name="daysSincePrevious", type=int, nullable=True),
        "annualizedGrowthPct": FieldSpec(name="annualizedGrowthPct", type=float, nullable=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
        "page": FieldSpec(name="page", type=int, required=False),
        "perPage": FieldSpec(name="perPage", type=int, required=False),
        "totalRecords": FieldSpec(name="totalRecords", type=int, required=False),
        "totalPages": FieldSpec(name="totalPages", type=int, required=False),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=True,
)

PRICE_GROWTH_CONTRACT = EndpointContract(
    endpoint="transactions/price-growth",
    version="v3",
    param_schema=PRICE_GROWTH_PARAM_SCHEMA,
    service_schema=PRICE_GROWTH_SERVICE_SCHEMA,
    response_schema=PRICE_GROWTH_RESPONSE_SCHEMA,
    compat_map=None,
    serializer=None,
    mode=SchemaMode.WARN,
)

register_contract(PRICE_GROWTH_CONTRACT)


# =============================================================================
# /transactions/price-growth/segments
# =============================================================================

SEGMENTS_PARAM_SCHEMA = ParamSchema(
    fields={
        "project": FieldSpec(
            name="project",
            type=str,
            nullable=True,
            description="Project name (partial match)"
        ),
        "district": FieldSpec(
            name="district",
            type=str,
            nullable=True,
            description="District code (D01-D28)"
        ),
        "sale_type": FieldSpec(
            name="sale_type",
            type=str,
            nullable=True,
            allowed_values=SaleType.ALL,
            description="Sale type (new_sale, resale, sub_sale)"
        ),
    },
    aliases={
        "saleType": "sale_type",
    }
)

SEGMENTS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project": FieldSpec(name="project", type=str, nullable=True),
        "district": FieldSpec(name="district", type=str, nullable=True),
        "sale_type": FieldSpec(name="sale_type", type=str, nullable=True),
    }
)

SEGMENTS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "project": FieldSpec(name="project", type=str, required=False),
        "bedroomCount": FieldSpec(name="bedroomCount", type=int, required=False),
        "floorLevel": FieldSpec(name="floorLevel", type=str, required=False),
        "transactionCount": FieldSpec(name="transactionCount", type=int, required=False),
        "avgCumulativeGrowthPct": FieldSpec(name="avgCumulativeGrowthPct", type=float, nullable=True),
        "avgAnnualizedGrowthPct": FieldSpec(name="avgAnnualizedGrowthPct", type=float, nullable=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=True,
)

SEGMENTS_CONTRACT = EndpointContract(
    endpoint="transactions/price-growth/segments",
    version="v3",
    param_schema=SEGMENTS_PARAM_SCHEMA,
    service_schema=SEGMENTS_SERVICE_SCHEMA,
    response_schema=SEGMENTS_RESPONSE_SCHEMA,
    compat_map=None,
    serializer=None,
    mode=SchemaMode.WARN,
)

register_contract(SEGMENTS_CONTRACT)
