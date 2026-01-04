"""
Contract schemas for /upcoming-launches endpoints.

Active endpoints:
- GET /api/upcoming-launches/all
- GET /api/upcoming-launches/needs-review
"""

from ..registry import (
    EndpointContract,
    ParamSchema,
    ServiceBoundarySchema,
    ResponseSchema,
    FieldSpec,
    register_contract,
    make_meta_fields,
    make_required_meta,
)
from ..pydantic_models import UpcomingLaunchesAllParams, UpcomingNeedsReviewParams


# =============================================================================
# /upcoming-launches/all
# =============================================================================

UPCOMING_ALL_PARAM_SCHEMA = ParamSchema(
    fields={
        "market_segment": FieldSpec(
            name="market_segment",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Filter by market segment"
        ),
        "district": FieldSpec(
            name="district",
            type=str,
            description="Filter by district"
        ),
        "launch_year": FieldSpec(
            name="launch_year",
            type=int,
            description="Filter by launch year"
        ),
        "needs_review": FieldSpec(
            name="needs_review",
            type=str,
            description="true/false for review items"
        ),
        "limit": FieldSpec(
            name="limit",
            type=int,
            default=100,
            description="Max results"
        ),
        "sort": FieldSpec(
            name="sort",
            type=str,
            default="project_name",
            description="Field to sort by"
        ),
        "order": FieldSpec(
            name="order",
            type=str,
            default="asc",
            allowed_values=["asc", "desc"],
            description="Sort order"
        ),
    },
    aliases={}
)

UPCOMING_ALL_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "market_segment": FieldSpec(name="market_segment", type=str),
        "district": FieldSpec(name="district", type=str),
        "launch_year": FieldSpec(name="launch_year", type=int),
        "needs_review": FieldSpec(name="needs_review", type=str),
        "limit": FieldSpec(name="limit", type=int, default=100),
        "sort": FieldSpec(name="sort", type=str, default="project_name"),
        "order": FieldSpec(name="order", type=str, default="asc"),
    }
)

UPCOMING_ALL_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "count": FieldSpec(name="count", type=int, required=True),
        "summary": FieldSpec(name="summary", type=dict, required=False),
        "meta": FieldSpec(name="meta", type=dict, required=False),
        "data": FieldSpec(name="data", type=list, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

UPCOMING_ALL_CONTRACT = EndpointContract(
    endpoint="upcoming-launches/all",
    version="v3",
    response_schema=UPCOMING_ALL_RESPONSE_SCHEMA,
    pydantic_model=UpcomingLaunchesAllParams,
)

register_contract(UPCOMING_ALL_CONTRACT)


# =============================================================================
# /upcoming-launches/needs-review
# =============================================================================

UPCOMING_NEEDS_REVIEW_PARAM_SCHEMA = ParamSchema(
    fields={},
    aliases={}
)

UPCOMING_NEEDS_REVIEW_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

UPCOMING_NEEDS_REVIEW_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "count": FieldSpec(name="count", type=int, required=True),
        "data": FieldSpec(name="data", type=list, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

UPCOMING_NEEDS_REVIEW_CONTRACT = EndpointContract(
    endpoint="upcoming-launches/needs-review",
    version="v3",
    response_schema=UPCOMING_NEEDS_REVIEW_RESPONSE_SCHEMA,
    pydantic_model=UpcomingNeedsReviewParams,
)

register_contract(UPCOMING_NEEDS_REVIEW_CONTRACT)
