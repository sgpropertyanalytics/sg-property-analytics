"""
Contract schema for /aggregate endpoint.

This is the core aggregation endpoint used by all charts for Power BI-style
dynamic filtering.

Endpoint: GET /api/aggregate
"""

from datetime import date
from api.contracts.contract_schema import SaleType, Tenure

from ..registry import (
    EndpointContract,
    ParamSchema,
    ServiceBoundarySchema,
    ResponseSchema,
    FieldSpec,
    register_contract,
)


# =============================================================================
# PARAM SCHEMA - What frontend sends
# =============================================================================

AGGREGATE_PARAM_SCHEMA = ParamSchema(
    fields={
        # Grouping and metrics
        "group_by": FieldSpec(
            name="group_by",
            type=str,
            required=False,
            default="month",
            allowed_values=None,  # Comma-separated: month, quarter, year, district, bedroom, sale_type, project, region, floor_level
            description="Comma-separated grouping dimensions"
        ),
        "metrics": FieldSpec(
            name="metrics",
            type=str,
            required=False,
            default="count,avg_psf",
            description="Comma-separated metrics: count, median_psf, avg_psf, total_value, median_price, avg_price, min_psf, max_psf, etc."
        ),

        # Filters
        "district": FieldSpec(
            name="district",
            type=str,
            nullable=True,
            description="Comma-separated district codes (D01, D02, or just 1, 2)"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            nullable=True,
            description="Comma-separated bedroom counts (2, 3, 4)"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter (CCR, RCR, OCR)"
        ),
        "region": FieldSpec(
            name="region",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Alias for segment filter"
        ),
        "sale_type": FieldSpec(
            name="sale_type",
            type=str,
            nullable=True,
            allowed_values=SaleType.ALL,
            description="Sale type filter (new_sale, resale, sub_sale)"
        ),
        "tenure": FieldSpec(
            name="tenure",
            type=str,
            nullable=True,
            allowed_values=Tenure.ALL,
            description="Tenure filter (freehold, 99_year, 999_year)"
        ),
        "project": FieldSpec(
            name="project",
            type=str,
            nullable=True,
            description="Project name filter (partial match)"
        ),
        "project_exact": FieldSpec(
            name="project_exact",
            type=str,
            nullable=True,
            description="Project name filter (exact match for drill-through)"
        ),

        # Date range
        "date_from": FieldSpec(
            name="date_from",
            type=date,
            nullable=True,
            description="Start date (inclusive), YYYY-MM-DD"
        ),
        "date_to": FieldSpec(
            name="date_to",
            type=date,
            nullable=True,
            description="End date (inclusive), YYYY-MM-DD"
        ),

        # Value range filters
        "psf_min": FieldSpec(
            name="psf_min",
            type=float,
            nullable=True,
            description="Minimum PSF filter"
        ),
        "psf_max": FieldSpec(
            name="psf_max",
            type=float,
            nullable=True,
            description="Maximum PSF filter"
        ),
        "size_min": FieldSpec(
            name="size_min",
            type=float,
            nullable=True,
            description="Minimum sqft filter"
        ),
        "size_max": FieldSpec(
            name="size_max",
            type=float,
            nullable=True,
            description="Maximum sqft filter"
        ),

        # Pagination and caching
        "limit": FieldSpec(
            name="limit",
            type=int,
            default=1000,
            description="Max rows to return (1-10000)"
        ),
        "skip_cache": FieldSpec(
            name="skip_cache",
            type=bool,
            default=False,
            description="Bypass cache if true"
        ),
    },
    aliases={
        # Frontend may send camelCase
        "saleType": "sale_type",
        "dateFrom": "date_from",
        "dateTo": "date_to",
        "groupBy": "group_by",
        "psfMin": "psf_min",
        "psfMax": "psf_max",
        "sizeMin": "size_min",
        "sizeMax": "size_max",
        "skipCache": "skip_cache",
        "projectExact": "project_exact",
    }
)


# =============================================================================
# SERVICE BOUNDARY SCHEMA - What service receives after normalization
# =============================================================================

AGGREGATE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "group_by": FieldSpec(name="group_by", type=list, required=True),
        "metrics": FieldSpec(name="metrics", type=list, required=True),
        "districts": FieldSpec(name="districts", type=list, nullable=True),
        "bedrooms": FieldSpec(name="bedrooms", type=list, nullable=True),
        "segments": FieldSpec(name="segments", type=list, nullable=True),
        "date_from": FieldSpec(name="date_from", type=date, nullable=True),
        "date_to_exclusive": FieldSpec(name="date_to_exclusive", type=date, nullable=True),
        "sale_type": FieldSpec(name="sale_type", type=str, nullable=True),
        "tenure": FieldSpec(name="tenure", type=str, nullable=True),
        "project": FieldSpec(name="project", type=str, nullable=True),
        "project_exact": FieldSpec(name="project_exact", type=str, nullable=True),
        "psf_min": FieldSpec(name="psf_min", type=float, nullable=True),
        "psf_max": FieldSpec(name="psf_max", type=float, nullable=True),
        "size_min": FieldSpec(name="size_min", type=float, nullable=True),
        "size_max": FieldSpec(name="size_max", type=float, nullable=True),
        "limit": FieldSpec(name="limit", type=int, default=1000),
        "skip_cache": FieldSpec(name="skip_cache", type=bool, default=False),
    }
)


# =============================================================================
# RESPONSE SCHEMA - What endpoint returns
# =============================================================================

AGGREGATE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # Period fields (depends on group_by)
        "period": FieldSpec(name="period", type=str, required=False),
        "periodGrain": FieldSpec(name="periodGrain", type=str, required=False),
        "month": FieldSpec(name="month", type=str, required=False),
        "quarter": FieldSpec(name="quarter", type=str, required=False),
        "year": FieldSpec(name="year", type=int, required=False),

        # Dimension fields
        "district": FieldSpec(name="district", type=str, required=False),
        "bedroom": FieldSpec(name="bedroom", type=int, required=False),
        "bedroomCount": FieldSpec(name="bedroomCount", type=int, required=False),
        "saleType": FieldSpec(name="saleType", type=str, required=False),
        "project": FieldSpec(name="project", type=str, required=False),
        "region": FieldSpec(name="region", type=str, required=False),
        "floorLevel": FieldSpec(name="floorLevel", type=str, required=False),

        # Metric fields (always includes count)
        "count": FieldSpec(name="count", type=int, required=True),
        "medianPsf": FieldSpec(name="medianPsf", type=float, nullable=True),
        "avgPsf": FieldSpec(name="avgPsf", type=float, nullable=True),
        "totalValue": FieldSpec(name="totalValue", type=int, nullable=True),
        "avgPrice": FieldSpec(name="avgPrice", type=float, nullable=True),
        "medianPrice": FieldSpec(name="medianPrice", type=float, nullable=True),

        # Project inventory fields (when group_by=project and metrics includes total_units)
        "totalUnits": FieldSpec(name="totalUnits", type=int, nullable=True),
        "totalUnitsSource": FieldSpec(name="totalUnitsSource", type=str, nullable=True),
        "totalUnitsConfidence": FieldSpec(name="totalUnitsConfidence", type=str, nullable=True),
        # TOP year for age calculation (when group_by=project and metrics includes total_units)
        "topYear": FieldSpec(name="topYear", type=int, nullable=True),
        # Lease info and age band (when group_by=project)
        "leaseStartYear": FieldSpec(name="leaseStartYear", type=int, nullable=True),
        "propertyAgeYears": FieldSpec(name="propertyAgeYears", type=int, nullable=True),
        "ageBand": FieldSpec(name="ageBand", type=str, nullable=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "cacheHit": FieldSpec(name="cacheHit", type=bool, required=False),
        "filtersApplied": FieldSpec(name="filtersApplied", type=dict, required=True),
        "totalRecords": FieldSpec(name="totalRecords", type=int, required=False),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
        "schemaVersion": FieldSpec(name="schemaVersion", type=str, required=False),
    },
    required_meta=["requestId", "elapsedMs", "filtersApplied", "apiVersion"],
    data_is_list=True,
)


# =============================================================================
# REGISTER CONTRACT
# =============================================================================

AGGREGATE_CONTRACT = EndpointContract(
    endpoint="aggregate",
    version="v3",
    param_schema=AGGREGATE_PARAM_SCHEMA,
    service_schema=AGGREGATE_SERVICE_SCHEMA,
    response_schema=AGGREGATE_RESPONSE_SCHEMA,
    serializer=None,  # Uses existing serialize_aggregate_response in route
)

# Register on import
register_contract(AGGREGATE_CONTRACT)

