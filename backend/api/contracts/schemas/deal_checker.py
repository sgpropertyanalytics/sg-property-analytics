"""
Contract schemas for Deal Checker endpoints.

Deal Checker provides transaction comparison and percentile analysis.

Endpoints:
- GET /api/deal-checker/multi-scope
- GET /api/projects/names
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
from ..pydantic_models import DealCheckerMultiScopeParams, ProjectNamesParams


# =============================================================================
# /deal-checker/multi-scope
# =============================================================================

MULTI_SCOPE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "project": FieldSpec(name="project", type=dict, required=True),
        "filters": FieldSpec(name="filters", type=dict, required=True),
        "scopes": FieldSpec(name="scopes", type=dict, required=True),
        "map_data": FieldSpec(name="map_data", type=dict, required=True),
        "meta": FieldSpec(name="meta", type=dict, required=False),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

MULTI_SCOPE_CONTRACT = EndpointContract(
    endpoint="deal-checker/multi-scope",
    version="v3",
    pydantic_model=DealCheckerMultiScopeParams,
    response_schema=MULTI_SCOPE_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(MULTI_SCOPE_CONTRACT)


# =============================================================================
# /projects/names
# =============================================================================

PROJECT_NAMES_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "projects": FieldSpec(name="projects", type=list, required=True),
        "count": FieldSpec(name="count", type=int, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

PROJECT_NAMES_CONTRACT = EndpointContract(
    endpoint="deal-checker/project-names",
    version="v3",
    pydantic_model=ProjectNamesParams,
    response_schema=PROJECT_NAMES_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECT_NAMES_CONTRACT)
