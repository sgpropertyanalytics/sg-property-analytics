"""
Contract schemas for Deal Checker endpoints.

Deal Checker provides transaction comparison and percentile analysis.

Endpoints:
- GET /api/deal-checker/multi-scope
- GET /api/projects/names
"""

from ..registry import (
    EndpointContract,
    ParamSchema,
    ServiceBoundarySchema,
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

MULTI_SCOPE_PARAM_SCHEMA = ParamSchema(
    fields={
        "project_name": FieldSpec(
            name="project_name",
            type=str,
            required=True,
            description="Name of the project"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=int,
            required=True,
            description="Bedroom count (1-5, where 5 means 5+)"
        ),
        "price": FieldSpec(
            name="price",
            type=float,
            required=True,
            description="Buyer's price paid"
        ),
        "sqft": FieldSpec(
            name="sqft",
            type=float,
            description="Unit size in sqft for ±15% range filtering"
        ),
    },
    aliases={}
)

MULTI_SCOPE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
        "bedrooms": FieldSpec(name="bedrooms", type=list, required=True),
        "price": FieldSpec(name="price", type=float, required=True),
        "sqft": FieldSpec(name="sqft", type=float),
    }
)

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
    param_schema=MULTI_SCOPE_PARAM_SCHEMA,
    service_schema=MULTI_SCOPE_SERVICE_SCHEMA,
    response_schema=MULTI_SCOPE_RESPONSE_SCHEMA,
    pydantic_model=DealCheckerMultiScopeParams,
    mode=SchemaMode.WARN,
)

register_contract(MULTI_SCOPE_CONTRACT)


# =============================================================================
# /projects/names
# =============================================================================

PROJECT_NAMES_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

PROJECT_NAMES_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

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
    param_schema=PROJECT_NAMES_PARAM_SCHEMA,
    service_schema=PROJECT_NAMES_SERVICE_SCHEMA,
    response_schema=PROJECT_NAMES_RESPONSE_SCHEMA,
    pydantic_model=ProjectNamesParams,
    mode=SchemaMode.WARN,
)

register_contract(PROJECT_NAMES_CONTRACT)
