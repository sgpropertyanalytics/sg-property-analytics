"""
Contract schemas for /projects/* endpoints.

Active endpoints:
- GET /api/projects/locations
- GET /api/projects/hot
- GET /api/projects/inventory/status
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
from ..pydantic_models import (
    ProjectsLocationsParams,
    ProjectsHotParams,
    ProjectsInventoryStatusParams,
)


# =============================================================================
# /projects/locations
# =============================================================================

PROJECTS_LOCATIONS_PARAM_SCHEMA = ParamSchema(
    fields={
        "status": FieldSpec(name="status", type=str, description="Geocode status"),
        "district": FieldSpec(name="district", type=str, description="Comma-separated districts"),
        "segment": FieldSpec(
            name="segment",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter"
        ),
        "has_school": FieldSpec(name="has_school", type=str, description="true/false"),
        "search": FieldSpec(name="search", type=str, description="Project name search"),
        "limit": FieldSpec(name="limit", type=int, default=100, description="Max results"),
        "offset": FieldSpec(name="offset", type=int, default=0, description="Pagination offset"),
    },
    aliases={}
)

PROJECTS_LOCATIONS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "status": FieldSpec(name="status", type=str),
        "districts": FieldSpec(name="districts", type=list),
        "segment": FieldSpec(name="segment", type=str),
        "has_school": FieldSpec(name="has_school", type=str),
        "search": FieldSpec(name="search", type=str),
        "limit": FieldSpec(name="limit", type=int, default=100),
        "offset": FieldSpec(name="offset", type=int, default=0),
    }
)

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
    response_schema=PROJECTS_LOCATIONS_RESPONSE_SCHEMA,
    pydantic_model=ProjectsLocationsParams,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_LOCATIONS_CONTRACT)


# =============================================================================
# /projects/hot
# =============================================================================

PROJECTS_HOT_PARAM_SCHEMA = ParamSchema(
    fields={
        "market_segment": FieldSpec(
            name="market_segment",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter"
        ),
        "region": FieldSpec(
            name="region",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Alias for market_segment"
        ),
        "district": FieldSpec(name="district", type=str, description="Comma-separated districts"),
        "bedroom": FieldSpec(name="bedroom", type=str, description="Bedroom count"),
        "price_min": FieldSpec(name="price_min", type=str, description="Minimum median price"),
        "price_max": FieldSpec(name="price_max", type=str, description="Maximum median price"),
        "limit": FieldSpec(name="limit", type=int, default=100, description="Max results"),
    },
    aliases={"region": "market_segment"}
)

PROJECTS_HOT_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "market_segment": FieldSpec(name="market_segment", type=str),
        "districts": FieldSpec(name="districts", type=list),
        "bedrooms": FieldSpec(name="bedrooms", type=list),
        "price_min": FieldSpec(name="price_min", type=str),
        "price_max": FieldSpec(name="price_max", type=str),
        "limit": FieldSpec(name="limit", type=int, default=100),
    }
)

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
    response_schema=PROJECTS_HOT_RESPONSE_SCHEMA,
    pydantic_model=ProjectsHotParams,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_HOT_CONTRACT)


# =============================================================================
# /projects/inventory/status
# =============================================================================

PROJECTS_INVENTORY_STATUS_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

PROJECTS_INVENTORY_STATUS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

PROJECTS_INVENTORY_STATUS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

PROJECTS_INVENTORY_STATUS_CONTRACT = EndpointContract(
    endpoint="projects/inventory-status",
    version="v3",
    response_schema=PROJECTS_INVENTORY_STATUS_RESPONSE_SCHEMA,
    pydantic_model=ProjectsInventoryStatusParams,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_INVENTORY_STATUS_CONTRACT)
