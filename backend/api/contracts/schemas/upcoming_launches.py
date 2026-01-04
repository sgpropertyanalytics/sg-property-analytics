"""
Contract schemas for /upcoming-launches endpoints.

Active endpoints:
- GET /api/upcoming-launches/all
- GET /api/upcoming-launches/needs-review
"""

from ..registry import (
    EndpointContract,
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
    pydantic_model=UpcomingLaunchesAllParams,
    response_schema=UPCOMING_ALL_RESPONSE_SCHEMA,
)

register_contract(UPCOMING_ALL_CONTRACT)


# =============================================================================
# /upcoming-launches/needs-review
# =============================================================================

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
    pydantic_model=UpcomingNeedsReviewParams,
    response_schema=UPCOMING_NEEDS_REVIEW_RESPONSE_SCHEMA,
)

register_contract(UPCOMING_NEEDS_REVIEW_CONTRACT)
