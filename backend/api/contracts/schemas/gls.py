"""
Contract schemas for /gls endpoints.

Active endpoints:
- GET /gls/all
- GET /gls/needs-review
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
