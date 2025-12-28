"""
Contract schemas for /gls endpoints.

Government Land Sales (GLS) tender data endpoints.

Endpoints (public-facing):
- GET /gls/upcoming - Upcoming (launched) tenders
- GET /gls/awarded - Awarded tenders
- GET /gls/all - All tenders
- GET /gls/supply-pipeline - Aggregate supply pipeline
- GET /gls/price-floor - Aggregate price floor data
- GET /gls/tender/<release_id> - Specific tender details
- GET /gls/needs-review - Tenders needing review
- GET /gls/stats - Summary statistics

Admin endpoints (no contracts):
- POST /gls/scrape, /gls/reset, /gls/cron-refresh, /gls/trigger-refresh
- GET /gls/refresh-status
"""

from ..registry import (
    EndpointContract,
    ParamSchema,
    ServiceBoundarySchema,
    ResponseSchema,
    FieldSpec,
    register_contract,
)


# =============================================================================
# GLS/UPCOMING ENDPOINT
# =============================================================================

GLS_UPCOMING_PARAM_SCHEMA = ParamSchema(
    fields={
        "market_segment": FieldSpec(
            name="market_segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Filter by market segment"
        ),
        "planning_area": FieldSpec(
            name="planning_area",
            type=str,
            nullable=True,
            description="Filter by planning area (partial match)"
        ),
        "limit": FieldSpec(
            name="limit",
            type=int,
            default=50,
            description="Max results to return"
        ),
    },
    aliases={}
)

GLS_UPCOMING_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "market_segment": FieldSpec(name="market_segment", type=str, nullable=True),
        "planning_area": FieldSpec(name="planning_area", type=str, nullable=True),
        "limit": FieldSpec(name="limit", type=int, default=50),
    }
)

GLS_UPCOMING_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "status": FieldSpec(name="status", type=str, required=True),
        "disclaimer": FieldSpec(name="disclaimer", type=str, required=True),
        "count": FieldSpec(name="count", type=int, required=True),
        "data": FieldSpec(name="data", type=list, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

GLS_UPCOMING_CONTRACT = EndpointContract(
    endpoint="gls/upcoming",
    version="v3",
    param_schema=GLS_UPCOMING_PARAM_SCHEMA,
    service_schema=GLS_UPCOMING_SERVICE_SCHEMA,
    response_schema=GLS_UPCOMING_RESPONSE_SCHEMA,
)

register_contract(GLS_UPCOMING_CONTRACT)


# =============================================================================
# GLS/AWARDED ENDPOINT
# =============================================================================

GLS_AWARDED_PARAM_SCHEMA = ParamSchema(
    fields={
        "market_segment": FieldSpec(
            name="market_segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Filter by market segment"
        ),
        "planning_area": FieldSpec(
            name="planning_area",
            type=str,
            nullable=True,
            description="Filter by planning area (partial match)"
        ),
        "limit": FieldSpec(
            name="limit",
            type=int,
            default=50,
            description="Max results to return"
        ),
    },
    aliases={}
)

GLS_AWARDED_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "market_segment": FieldSpec(name="market_segment", type=str, nullable=True),
        "planning_area": FieldSpec(name="planning_area", type=str, nullable=True),
        "limit": FieldSpec(name="limit", type=int, default=50),
    }
)

GLS_AWARDED_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "status": FieldSpec(name="status", type=str, required=True),
        "disclaimer": FieldSpec(name="disclaimer", type=str, required=True),
        "count": FieldSpec(name="count", type=int, required=True),
        "data": FieldSpec(name="data", type=list, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

GLS_AWARDED_CONTRACT = EndpointContract(
    endpoint="gls/awarded",
    version="v3",
    param_schema=GLS_AWARDED_PARAM_SCHEMA,
    service_schema=GLS_AWARDED_SERVICE_SCHEMA,
    response_schema=GLS_AWARDED_RESPONSE_SCHEMA,
)

register_contract(GLS_AWARDED_CONTRACT)


# =============================================================================
# GLS/ALL ENDPOINT
# =============================================================================

GLS_ALL_PARAM_SCHEMA = ParamSchema(
    fields={
        "market_segment": FieldSpec(
            name="market_segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Filter by market segment"
        ),
        "status": FieldSpec(
            name="status",
            type=str,
            nullable=True,
            allowed_values=["launched", "awarded"],
            description="Filter by tender status"
        ),
        "planning_area": FieldSpec(
            name="planning_area",
            type=str,
            nullable=True,
            description="Filter by planning area (partial match)"
        ),
        "limit": FieldSpec(
            name="limit",
            type=int,
            default=100,
            description="Max results to return"
        ),
        "sort": FieldSpec(
            name="sort",
            type=str,
            default="release_date",
            description="Field to sort by"
        ),
        "order": FieldSpec(
            name="order",
            type=str,
            default="desc",
            allowed_values=["asc", "desc"],
            description="Sort order"
        ),
    },
    aliases={}
)

GLS_ALL_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "market_segment": FieldSpec(name="market_segment", type=str, nullable=True),
        "status": FieldSpec(name="status", type=str, nullable=True),
        "planning_area": FieldSpec(name="planning_area", type=str, nullable=True),
        "limit": FieldSpec(name="limit", type=int, default=100),
        "sort": FieldSpec(name="sort", type=str, default="release_date"),
        "order": FieldSpec(name="order", type=str, default="desc"),
    }
)

GLS_ALL_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "count": FieldSpec(name="count", type=int, required=True),
        "summary": FieldSpec(name="summary", type=dict, required=True),
        "data": FieldSpec(name="data", type=list, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

GLS_ALL_CONTRACT = EndpointContract(
    endpoint="gls/all",
    version="v3",
    param_schema=GLS_ALL_PARAM_SCHEMA,
    service_schema=GLS_ALL_SERVICE_SCHEMA,
    response_schema=GLS_ALL_RESPONSE_SCHEMA,
)

register_contract(GLS_ALL_CONTRACT)


# =============================================================================
# GLS/SUPPLY-PIPELINE ENDPOINT
# =============================================================================

GLS_SUPPLY_PIPELINE_PARAM_SCHEMA = ParamSchema(
    fields={
        "market_segment": FieldSpec(
            name="market_segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Filter by market segment"
        ),
    },
    aliases={}
)

GLS_SUPPLY_PIPELINE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "market_segment": FieldSpec(name="market_segment", type=str, nullable=True),
    }
)

GLS_SUPPLY_PIPELINE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},  # Dynamic structure from service
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

GLS_SUPPLY_PIPELINE_CONTRACT = EndpointContract(
    endpoint="gls/supply-pipeline",
    version="v3",
    param_schema=GLS_SUPPLY_PIPELINE_PARAM_SCHEMA,
    service_schema=GLS_SUPPLY_PIPELINE_SERVICE_SCHEMA,
    response_schema=GLS_SUPPLY_PIPELINE_RESPONSE_SCHEMA,
)

register_contract(GLS_SUPPLY_PIPELINE_CONTRACT)


# =============================================================================
# GLS/PRICE-FLOOR ENDPOINT
# =============================================================================

GLS_PRICE_FLOOR_PARAM_SCHEMA = ParamSchema(
    fields={
        "market_segment": FieldSpec(
            name="market_segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Filter by market segment"
        ),
    },
    aliases={}
)

GLS_PRICE_FLOOR_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "market_segment": FieldSpec(name="market_segment", type=str, nullable=True),
    }
)

GLS_PRICE_FLOOR_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},  # Dynamic structure from service
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

GLS_PRICE_FLOOR_CONTRACT = EndpointContract(
    endpoint="gls/price-floor",
    version="v3",
    param_schema=GLS_PRICE_FLOOR_PARAM_SCHEMA,
    service_schema=GLS_PRICE_FLOOR_SERVICE_SCHEMA,
    response_schema=GLS_PRICE_FLOOR_RESPONSE_SCHEMA,
)

register_contract(GLS_PRICE_FLOOR_CONTRACT)


# =============================================================================
# GLS/TENDER/<RELEASE_ID> ENDPOINT
# =============================================================================

GLS_TENDER_DETAIL_PARAM_SCHEMA = ParamSchema(
    fields={},  # release_id is a path param, not query param
    aliases={}
)

GLS_TENDER_DETAIL_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "release_id": FieldSpec(name="release_id", type=str, required=True),
    }
)

GLS_TENDER_DETAIL_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},  # Returns tender dict directly
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

GLS_TENDER_DETAIL_CONTRACT = EndpointContract(
    endpoint="gls/tender",
    version="v3",
    param_schema=GLS_TENDER_DETAIL_PARAM_SCHEMA,
    service_schema=GLS_TENDER_DETAIL_SERVICE_SCHEMA,
    response_schema=GLS_TENDER_DETAIL_RESPONSE_SCHEMA,
)

register_contract(GLS_TENDER_DETAIL_CONTRACT)


# =============================================================================
# GLS/NEEDS-REVIEW ENDPOINT
# =============================================================================

GLS_NEEDS_REVIEW_PARAM_SCHEMA = ParamSchema(
    fields={},  # No query params
    aliases={}
)

GLS_NEEDS_REVIEW_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

GLS_NEEDS_REVIEW_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "count": FieldSpec(name="count", type=int, required=True),
        "data": FieldSpec(name="data", type=list, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

GLS_NEEDS_REVIEW_CONTRACT = EndpointContract(
    endpoint="gls/needs-review",
    version="v3",
    param_schema=GLS_NEEDS_REVIEW_PARAM_SCHEMA,
    service_schema=GLS_NEEDS_REVIEW_SERVICE_SCHEMA,
    response_schema=GLS_NEEDS_REVIEW_RESPONSE_SCHEMA,
)

register_contract(GLS_NEEDS_REVIEW_CONTRACT)


# =============================================================================
# GLS/STATS ENDPOINT
# =============================================================================

GLS_STATS_PARAM_SCHEMA = ParamSchema(
    fields={},  # No query params
    aliases={}
)

GLS_STATS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

GLS_STATS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "status_summary": FieldSpec(name="status_summary", type=dict, required=True),
        "by_region": FieldSpec(name="by_region", type=dict, required=True),
        "date_range": FieldSpec(name="date_range", type=dict, required=True),
        "total_tenders": FieldSpec(name="total_tenders", type=int, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

GLS_STATS_CONTRACT = EndpointContract(
    endpoint="gls/stats",
    version="v3",
    param_schema=GLS_STATS_PARAM_SCHEMA,
    service_schema=GLS_STATS_SERVICE_SCHEMA,
    response_schema=GLS_STATS_RESPONSE_SCHEMA,
)

register_contract(GLS_STATS_CONTRACT)
