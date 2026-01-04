"""
Contract schemas for /gls endpoints.

Active endpoints:
- GET /gls/all
- GET /gls/needs-review
"""

from ..registry import (
    EndpointContract,
    ResponseSchema,
    FieldSpec,
    register_contract,
    make_meta_fields,
    make_required_meta,
)
from ..pydantic_models import GlsAllParams, GlsNeedsReviewParams


# =============================================================================
# GLS/ALL ENDPOINT
# =============================================================================

GLS_ALL_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "count": FieldSpec(name="count", type=int, required=True),
        "summary": FieldSpec(name="summary", type=dict, required=True),
        "data": FieldSpec(name="data", type=list, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

GLS_ALL_CONTRACT = EndpointContract(
    endpoint="gls/all",
    version="v3",
    pydantic_model=GlsAllParams,
    response_schema=GLS_ALL_RESPONSE_SCHEMA,
)

register_contract(GLS_ALL_CONTRACT)


# =============================================================================
# GLS/NEEDS-REVIEW ENDPOINT
# =============================================================================

GLS_NEEDS_REVIEW_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "count": FieldSpec(name="count", type=int, required=True),
        "data": FieldSpec(name="data", type=list, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

GLS_NEEDS_REVIEW_CONTRACT = EndpointContract(
    endpoint="gls/needs-review",
    version="v3",
    pydantic_model=GlsNeedsReviewParams,
    response_schema=GLS_NEEDS_REVIEW_RESPONSE_SCHEMA,
)

register_contract(GLS_NEEDS_REVIEW_CONTRACT)
