"""
Contract schemas for /projects/* endpoints.

Project locations, schools, and inventory endpoints.

Endpoints:
- GET /api/projects/<project_name>/school-flag
- GET /api/projects/with-school
- GET /api/projects/locations
- GET /api/projects/school-flags
- GET /api/schools
- GET /api/schools/<school_id>
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
)


# =============================================================================
# /projects/<project_name>/school-flag
# =============================================================================

PROJECT_SCHOOL_FLAG_PARAM_SCHEMA = ParamSchema(
    fields={},  # project_name comes from URL path
    aliases={}
)

PROJECT_SCHOOL_FLAG_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
    }
)

PROJECT_SCHOOL_FLAG_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECT_SCHOOL_FLAG_CONTRACT = EndpointContract(
    endpoint="projects/school-flag",
    version="v3",
    param_schema=PROJECT_SCHOOL_FLAG_PARAM_SCHEMA,
    service_schema=PROJECT_SCHOOL_FLAG_SERVICE_SCHEMA,
    response_schema=PROJECT_SCHOOL_FLAG_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECT_SCHOOL_FLAG_CONTRACT)


# =============================================================================
# /projects/with-school
# =============================================================================

PROJECTS_WITH_SCHOOL_PARAM_SCHEMA = ParamSchema(
    fields={
        "district": FieldSpec(
            name="district",
            type=str,
            description="Comma-separated districts (D09,D10)"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter"
        ),
        "limit": FieldSpec(
            name="limit",
            type=int,
            default=100,
            description="Max results"
        ),
    },
    aliases={}
)

PROJECTS_WITH_SCHOOL_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "districts": FieldSpec(name="districts", type=list),
        "segment": FieldSpec(name="segment", type=str),
        "limit": FieldSpec(name="limit", type=int, default=100),
    }
)

PROJECTS_WITH_SCHOOL_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECTS_WITH_SCHOOL_CONTRACT = EndpointContract(
    endpoint="projects/with-school",
    version="v3",
    param_schema=PROJECTS_WITH_SCHOOL_PARAM_SCHEMA,
    service_schema=PROJECTS_WITH_SCHOOL_SERVICE_SCHEMA,
    response_schema=PROJECTS_WITH_SCHOOL_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_WITH_SCHOOL_CONTRACT)


# =============================================================================
# /projects/locations
# =============================================================================

PROJECTS_LOCATIONS_PARAM_SCHEMA = ParamSchema(
    fields={
        "status": FieldSpec(
            name="status",
            type=str,
            allowed_values=["pending", "success", "failed"],
            description="Geocode status filter"
        ),
        "district": FieldSpec(
            name="district",
            type=str,
            description="Comma-separated districts"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment"
        ),
        "has_school": FieldSpec(
            name="has_school",
            type=str,
            allowed_values=["true", "false"],
            description="School proximity filter"
        ),
        "search": FieldSpec(
            name="search",
            type=str,
            description="Project name search"
        ),
        "limit": FieldSpec(
            name="limit",
            type=int,
            default=100,
            description="Max results"
        ),
        "offset": FieldSpec(
            name="offset",
            type=int,
            default=0,
            description="Pagination offset"
        ),
    },
    aliases={}
)

PROJECTS_LOCATIONS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "status": FieldSpec(name="status", type=str),
        "districts": FieldSpec(name="districts", type=list),
        "segment": FieldSpec(name="segment", type=str),
        "has_school": FieldSpec(name="has_school", type=bool),
        "search": FieldSpec(name="search", type=str),
        "limit": FieldSpec(name="limit", type=int, default=100),
        "offset": FieldSpec(name="offset", type=int, default=0),
    }
)

PROJECTS_LOCATIONS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECTS_LOCATIONS_CONTRACT = EndpointContract(
    endpoint="projects/locations",
    version="v3",
    param_schema=PROJECTS_LOCATIONS_PARAM_SCHEMA,
    service_schema=PROJECTS_LOCATIONS_SERVICE_SCHEMA,
    response_schema=PROJECTS_LOCATIONS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_LOCATIONS_CONTRACT)


# =============================================================================
# /projects/school-flags
# =============================================================================

PROJECTS_SCHOOL_FLAGS_PARAM_SCHEMA = ParamSchema(
    fields={
        "projects": FieldSpec(
            name="projects",
            type=str,
            required=True,
            description="Comma-separated project names (max 100)"
        ),
    },
    aliases={}
)

PROJECTS_SCHOOL_FLAGS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_names": FieldSpec(name="project_names", type=list, required=True),
    }
)

PROJECTS_SCHOOL_FLAGS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECTS_SCHOOL_FLAGS_CONTRACT = EndpointContract(
    endpoint="projects/school-flags",
    version="v3",
    param_schema=PROJECTS_SCHOOL_FLAGS_PARAM_SCHEMA,
    service_schema=PROJECTS_SCHOOL_FLAGS_SERVICE_SCHEMA,
    response_schema=PROJECTS_SCHOOL_FLAGS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_SCHOOL_FLAGS_CONTRACT)


# =============================================================================
# /schools
# =============================================================================

SCHOOLS_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

SCHOOLS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

SCHOOLS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

SCHOOLS_CONTRACT = EndpointContract(
    endpoint="projects/schools",
    version="v3",
    param_schema=SCHOOLS_PARAM_SCHEMA,
    service_schema=SCHOOLS_SERVICE_SCHEMA,
    response_schema=SCHOOLS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(SCHOOLS_CONTRACT)


# =============================================================================
# /schools/<school_id>
# =============================================================================

SCHOOL_BY_ID_PARAM_SCHEMA = ParamSchema(
    fields={},  # school_id comes from URL path
    aliases={}
)

SCHOOL_BY_ID_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "school_id": FieldSpec(name="school_id", type=int, required=True),
    }
)

SCHOOL_BY_ID_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

SCHOOL_BY_ID_CONTRACT = EndpointContract(
    endpoint="projects/school-by-id",
    version="v3",
    param_schema=SCHOOL_BY_ID_PARAM_SCHEMA,
    service_schema=SCHOOL_BY_ID_SERVICE_SCHEMA,
    response_schema=SCHOOL_BY_ID_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(SCHOOL_BY_ID_CONTRACT)


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
        "district": FieldSpec(
            name="district",
            type=str,
            description="Comma-separated districts"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=int,
            description="Bedroom count (1-5)"
        ),
        "price_min": FieldSpec(
            name="price_min",
            type=float,
            description="Minimum median price"
        ),
        "price_max": FieldSpec(
            name="price_max",
            type=float,
            description="Maximum median price"
        ),
        "limit": FieldSpec(
            name="limit",
            type=int,
            default=100,
            description="Max results"
        ),
    },
    aliases={
        "region": "market_segment",
    }
)

PROJECTS_HOT_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "market_segment": FieldSpec(name="market_segment", type=str),
        "districts": FieldSpec(name="districts", type=list),
        "bedroom": FieldSpec(name="bedroom", type=int),
        "price_min": FieldSpec(name="price_min", type=float),
        "price_max": FieldSpec(name="price_max", type=float),
        "limit": FieldSpec(name="limit", type=int, default=100),
    }
)

PROJECTS_HOT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECTS_HOT_CONTRACT = EndpointContract(
    endpoint="projects/hot",
    version="v3",
    param_schema=PROJECTS_HOT_PARAM_SCHEMA,
    service_schema=PROJECTS_HOT_SERVICE_SCHEMA,
    response_schema=PROJECTS_HOT_RESPONSE_SCHEMA,
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
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECTS_INVENTORY_STATUS_CONTRACT = EndpointContract(
    endpoint="projects/inventory-status",
    version="v3",
    param_schema=PROJECTS_INVENTORY_STATUS_PARAM_SCHEMA,
    service_schema=PROJECTS_INVENTORY_STATUS_SERVICE_SCHEMA,
    response_schema=PROJECTS_INVENTORY_STATUS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_INVENTORY_STATUS_CONTRACT)
