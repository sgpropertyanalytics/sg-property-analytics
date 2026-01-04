"""
Contract schemas for /projects/* endpoints.

Active endpoints:
- GET /api/projects/locations
- GET /api/projects/hot
- GET /api/projects/inventory/status
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
from ..pydantic_models import (
    ProjectsLocationsParams,
    ProjectsHotParams,
    ProjectsInventoryStatusParams,
)


# =============================================================================
# /projects/locations
# =============================================================================

PROJECTS_LOCATIONS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "projects": FieldSpec(name="projects", type=list, required=True),
        "pagination": FieldSpec(name="pagination", type=dict, required=True),
        "summary": FieldSpec(name="summary", type=dict, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

PROJECTS_LOCATIONS_CONTRACT = EndpointContract(
    endpoint="projects/locations",
    version="v3",
    pydantic_model=ProjectsLocationsParams,
    response_schema=PROJECTS_LOCATIONS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_LOCATIONS_CONTRACT)


# =============================================================================
# /projects/hot
# =============================================================================

PROJECTS_HOT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "projects": FieldSpec(name="projects", type=list, required=True),
        "total_count": FieldSpec(name="total_count", type=int, required=True),
        "filters_applied": FieldSpec(name="filters_applied", type=dict, required=False),
        "data_note": FieldSpec(name="data_note", type=str, required=False),
        "last_updated": FieldSpec(name="last_updated", type=str, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

PROJECTS_HOT_CONTRACT = EndpointContract(
    endpoint="projects/hot",
    version="v3",
    pydantic_model=ProjectsHotParams,
    response_schema=PROJECTS_HOT_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_HOT_CONTRACT)


# =============================================================================
# /projects/inventory/status
# =============================================================================

PROJECTS_INVENTORY_STATUS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

PROJECTS_INVENTORY_STATUS_CONTRACT = EndpointContract(
    endpoint="projects/inventory-status",
    version="v3",
    pydantic_model=ProjectsInventoryStatusParams,
    response_schema=PROJECTS_INVENTORY_STATUS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_INVENTORY_STATUS_CONTRACT)
