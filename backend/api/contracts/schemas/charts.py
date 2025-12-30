"""
Contract schemas for chart endpoints.

Specialized chart data endpoints for visualizations.

Endpoints:
- GET /api/projects_by_district
- GET /api/price_projects_by_district
- GET /api/floor-liquidity-heatmap
- GET /api/psf-by-price-band
- GET /api/budget-heatmap
"""

from api.contracts.contract_schema import SaleType, Tenure
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
# /projects_by_district
# =============================================================================

PROJECTS_BY_DISTRICT_PARAM_SCHEMA = ParamSchema(
    fields={
        "district": FieldSpec(
            name="district",
            type=str,
            required=True,
            description="District code (e.g., D09)"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            default="2,3,4",
            description="Comma-separated bedroom counts"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter"
        ),
    },
    aliases={}
)

PROJECTS_BY_DISTRICT_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "district": FieldSpec(name="district", type=str, required=True),
        "bedroom_types": FieldSpec(name="bedroom_types", type=list, default=[2, 3, 4]),
        "segment": FieldSpec(name="segment", type=str),
    }
)

PROJECTS_BY_DISTRICT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECTS_BY_DISTRICT_CONTRACT = EndpointContract(
    endpoint="charts/projects-by-district",
    version="v3",
    param_schema=PROJECTS_BY_DISTRICT_PARAM_SCHEMA,
    service_schema=PROJECTS_BY_DISTRICT_SERVICE_SCHEMA,
    response_schema=PROJECTS_BY_DISTRICT_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_BY_DISTRICT_CONTRACT)


# =============================================================================
# /price_projects_by_district
# =============================================================================

PRICE_PROJECTS_BY_DISTRICT_PARAM_SCHEMA = ParamSchema(
    fields={
        "district": FieldSpec(
            name="district",
            type=str,
            required=True,
            description="District code (e.g., D09)"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            default="2,3,4",
            description="Comma-separated bedroom counts"
        ),
        "months": FieldSpec(
            name="months",
            type=int,
            default=15,
            description="Timeframe in months"
        ),
    },
    aliases={}
)

PRICE_PROJECTS_BY_DISTRICT_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "district": FieldSpec(name="district", type=str, required=True),
        "bedroom_types": FieldSpec(name="bedroom_types", type=list, default=[2, 3, 4]),
        "months": FieldSpec(name="months", type=int, default=15),
    }
)

PRICE_PROJECTS_BY_DISTRICT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PRICE_PROJECTS_BY_DISTRICT_CONTRACT = EndpointContract(
    endpoint="charts/price-projects-by-district",
    version="v3",
    param_schema=PRICE_PROJECTS_BY_DISTRICT_PARAM_SCHEMA,
    service_schema=PRICE_PROJECTS_BY_DISTRICT_SERVICE_SCHEMA,
    response_schema=PRICE_PROJECTS_BY_DISTRICT_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PRICE_PROJECTS_BY_DISTRICT_CONTRACT)


# =============================================================================
# /floor-liquidity-heatmap
# =============================================================================

FLOOR_LIQUIDITY_HEATMAP_PARAM_SCHEMA = ParamSchema(
    fields={
        "window_months": FieldSpec(
            name="window_months",
            type=int,
            default=12,
            allowed_values=[6, 12, 24],
            description="Rolling window for velocity"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            description="Market segment (CCR, RCR, OCR)"
        ),
        "district": FieldSpec(
            name="district",
            type=str,
            description="Comma-separated districts"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            description="Comma-separated bedroom counts"
        ),
        "min_transactions": FieldSpec(
            name="min_transactions",
            type=int,
            default=30,
            description="Minimum transactions per project"
        ),
        "min_units": FieldSpec(
            name="min_units",
            type=int,
            default=100,
            description="Minimum units per project"
        ),
        "limit": FieldSpec(
            name="limit",
            type=int,
            default=0,
            description="Max projects to return (0 = no limit)"
        ),
        "skip_cache": FieldSpec(
            name="skip_cache",
            type=bool,
            default=False,
            description="Bypass cache"
        ),
    },
    aliases={}
)

FLOOR_LIQUIDITY_HEATMAP_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "window_months": FieldSpec(name="window_months", type=int, default=12),
        "segment": FieldSpec(name="segment", type=str),
        "districts": FieldSpec(name="districts", type=list),
        "bedrooms": FieldSpec(name="bedrooms", type=list),
        "min_transactions": FieldSpec(name="min_transactions", type=int, default=30),
        "limit": FieldSpec(name="limit", type=int, default=0),
        "skip_cache": FieldSpec(name="skip_cache", type=bool, default=False),
    }
)

FLOOR_LIQUIDITY_HEATMAP_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "projects": FieldSpec(name="projects", type=list, required=False),
        "floor_zone_order": FieldSpec(name="floor_zone_order", type=list, required=False),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
        "window_months": FieldSpec(name="window_months", type=int),
        "filters_applied": FieldSpec(name="filters_applied", type=dict),
        "filtersApplied": FieldSpec(name="filtersApplied", type=dict),
        "total_projects": FieldSpec(name="total_projects", type=int),
        "projects_returned": FieldSpec(name="projects_returned", type=int),
        "exclusions": FieldSpec(name="exclusions", type=dict),
        "cache_hit": FieldSpec(name="cache_hit", type=bool),
        "cacheHit": FieldSpec(name="cacheHit", type=bool),
        "elapsed_ms": FieldSpec(name="elapsed_ms", type=int),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

FLOOR_LIQUIDITY_HEATMAP_CONTRACT = EndpointContract(
    endpoint="charts/floor-liquidity-heatmap",
    version="v3",
    param_schema=FLOOR_LIQUIDITY_HEATMAP_PARAM_SCHEMA,
    service_schema=FLOOR_LIQUIDITY_HEATMAP_SERVICE_SCHEMA,
    response_schema=FLOOR_LIQUIDITY_HEATMAP_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(FLOOR_LIQUIDITY_HEATMAP_CONTRACT)


# =============================================================================
# /psf-by-price-band
# =============================================================================

PSF_BY_PRICE_BAND_PARAM_SCHEMA = ParamSchema(
    fields={
        "date_from": FieldSpec(
            name="date_from",
            type=str,
            description="Start date (YYYY-MM-DD)"
        ),
        "date_to": FieldSpec(
            name="date_to",
            type=str,
            description="End date (YYYY-MM-DD)"
        ),
        "district": FieldSpec(
            name="district",
            type=str,
            description="Comma-separated districts"
        ),
        "region": FieldSpec(
            name="region",
            type=str,
            description="Market region (CCR, RCR, OCR)"
        ),
        "sale_type": FieldSpec(
            name="sale_type",
            type=str,
            allowed_values=SaleType.ALL,
            description="Sale type filter (new_sale, resale, sub_sale)"
        ),
        "tenure": FieldSpec(
            name="tenure",
            type=str,
            allowed_values=Tenure.ALL,
            description="Tenure filter (freehold, 99_year, 999_year)"
        ),
    },
    aliases={
        "segment": "region",
        "saleType": "sale_type",
    }
)

PSF_BY_PRICE_BAND_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "date_from": FieldSpec(name="date_from", type=str),
        "date_to": FieldSpec(name="date_to", type=str),
        "districts": FieldSpec(name="districts", type=list),
        "segments_db": FieldSpec(name="segments_db", type=list),
        "sale_type_db": FieldSpec(name="sale_type_db", type=str),
        "tenure_db": FieldSpec(name="tenure_db", type=str),
    }
)

PSF_BY_PRICE_BAND_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
        "kAnonymity": FieldSpec(name="kAnonymity", type=dict),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PSF_BY_PRICE_BAND_CONTRACT = EndpointContract(
    endpoint="charts/psf-by-price-band",
    version="v3",
    param_schema=PSF_BY_PRICE_BAND_PARAM_SCHEMA,
    service_schema=PSF_BY_PRICE_BAND_SERVICE_SCHEMA,
    response_schema=PSF_BY_PRICE_BAND_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PSF_BY_PRICE_BAND_CONTRACT)


# =============================================================================
# /budget-heatmap
# =============================================================================

BUDGET_HEATMAP_PARAM_SCHEMA = ParamSchema(
    fields={
        "budget": FieldSpec(
            name="budget",
            type=int,
            required=True,
            description="Target budget in SGD"
        ),
        "tolerance": FieldSpec(
            name="tolerance",
            type=int,
            default=100000,
            description="+/- range for budget"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=int,
            description="Bedroom filter (1-5)"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment"
        ),
        "district": FieldSpec(
            name="district",
            type=str,
            description="District code"
        ),
        "tenure": FieldSpec(
            name="tenure",
            type=str,
            allowed_values=Tenure.ALL,
            description="Tenure type (freehold, 99_year, 999_year)"
        ),
        "months_lookback": FieldSpec(
            name="months_lookback",
            type=int,
            default=24,
            description="Time window in months (6-60)"
        ),
        "skip_cache": FieldSpec(
            name="skip_cache",
            type=bool,
            default=False,
            description="Bypass cache"
        ),
    },
    aliases={}
)

BUDGET_HEATMAP_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "budget": FieldSpec(name="budget", type=int, required=True),
        "tolerance": FieldSpec(name="tolerance", type=int, default=100000),
        "bedroom": FieldSpec(name="bedroom", type=int),
        "segment": FieldSpec(name="segment", type=str),
        "district": FieldSpec(name="district", type=str),
        "tenure": FieldSpec(name="tenure", type=str),
        "months_lookback": FieldSpec(name="months_lookback", type=int, default=24),
        "skip_cache": FieldSpec(name="skip_cache", type=bool, default=False),
    }
)

BUDGET_HEATMAP_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # v2 response keys (camelCase)
        "matrix": FieldSpec(name="matrix", type=dict, required=False),
        "ageBands": FieldSpec(name="ageBands", type=list, required=False),
        "bedroomTypes": FieldSpec(name="bedroomTypes", type=list, required=False),
        "totalCount": FieldSpec(name="totalCount", type=int, required=False),
        "insight": FieldSpec(name="insight", type=str, required=False),
        "meta": FieldSpec(name="meta", type=dict, required=False),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
        # v2 meta fields (camelCase)
        "budget": FieldSpec(name="budget", type=int),
        "tolerance": FieldSpec(name="tolerance", type=int),
        "priceRange": FieldSpec(name="priceRange", type=dict),
        "monthsLookback": FieldSpec(name="monthsLookback", type=int),
        "ageIsApprox": FieldSpec(name="ageIsApprox", type=bool),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

BUDGET_HEATMAP_CONTRACT = EndpointContract(
    endpoint="charts/budget-heatmap",
    version="v3",
    param_schema=BUDGET_HEATMAP_PARAM_SCHEMA,
    service_schema=BUDGET_HEATMAP_SERVICE_SCHEMA,
    response_schema=BUDGET_HEATMAP_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(BUDGET_HEATMAP_CONTRACT)
