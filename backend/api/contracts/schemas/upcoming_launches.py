"""
Contract schemas for /upcoming-launches/* endpoints.

Upcoming launches data for pre-launch projects.

Endpoints:
- GET /api/upcoming-launches/all
- GET /api/upcoming-launches/by-segment
- GET /api/upcoming-launches/supply-pipeline
- GET /api/upcoming-launches/project/<project_name>
- GET /api/upcoming-launches/stats
- GET /api/upcoming-launches/needs-review
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
# /upcoming-launches/all
# =============================================================================

UPCOMING_ALL_PARAM_SCHEMA = ParamSchema(
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
            description="District filter (e.g., D09)"
        ),
        "launch_year": FieldSpec(
            name="launch_year",
            type=int,
            description="Filter by launch year"
        ),
        "needs_review": FieldSpec(
            name="needs_review",
            type=str,
            allowed_values=["true", "false"],
            description="Filter for items needing review"
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
        "needs_review": FieldSpec(name="needs_review", type=bool, default=False),
        "limit": FieldSpec(name="limit", type=int, default=100),
        "sort_by": FieldSpec(name="sort_by", type=str, default="project_name"),
        "order": FieldSpec(name="order", type=str, default="asc"),
    }
)

UPCOMING_ALL_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

UPCOMING_ALL_CONTRACT = EndpointContract(
    endpoint="upcoming-launches/all",
    version="v3",
    param_schema=UPCOMING_ALL_PARAM_SCHEMA,
    service_schema=UPCOMING_ALL_SERVICE_SCHEMA,
    response_schema=UPCOMING_ALL_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(UPCOMING_ALL_CONTRACT)


# =============================================================================
# /upcoming-launches/by-segment
# =============================================================================

UPCOMING_BY_SEGMENT_PARAM_SCHEMA = ParamSchema(
    fields={
        "launch_year": FieldSpec(
            name="launch_year",
            type=int,
            default=2026,
            description="Launch year to filter by"
        ),
    },
    aliases={}
)

UPCOMING_BY_SEGMENT_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "launch_year": FieldSpec(name="launch_year", type=int, default=2026),
    }
)

UPCOMING_BY_SEGMENT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

UPCOMING_BY_SEGMENT_CONTRACT = EndpointContract(
    endpoint="upcoming-launches/by-segment",
    version="v3",
    param_schema=UPCOMING_BY_SEGMENT_PARAM_SCHEMA,
    service_schema=UPCOMING_BY_SEGMENT_SERVICE_SCHEMA,
    response_schema=UPCOMING_BY_SEGMENT_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(UPCOMING_BY_SEGMENT_CONTRACT)


# =============================================================================
# /upcoming-launches/supply-pipeline
# =============================================================================

UPCOMING_SUPPLY_PIPELINE_PARAM_SCHEMA = ParamSchema(
    fields={
        "launch_year": FieldSpec(
            name="launch_year",
            type=int,
            default=2026,
            description="Launch year to filter by"
        ),
        "market_segment": FieldSpec(
            name="market_segment",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter"
        ),
    },
    aliases={}
)

UPCOMING_SUPPLY_PIPELINE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "launch_year": FieldSpec(name="launch_year", type=int, default=2026),
        "market_segment": FieldSpec(name="market_segment", type=str),
    }
)

UPCOMING_SUPPLY_PIPELINE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

UPCOMING_SUPPLY_PIPELINE_CONTRACT = EndpointContract(
    endpoint="upcoming-launches/supply-pipeline",
    version="v3",
    param_schema=UPCOMING_SUPPLY_PIPELINE_PARAM_SCHEMA,
    service_schema=UPCOMING_SUPPLY_PIPELINE_SERVICE_SCHEMA,
    response_schema=UPCOMING_SUPPLY_PIPELINE_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(UPCOMING_SUPPLY_PIPELINE_CONTRACT)


# =============================================================================
# /upcoming-launches/project/<project_name>
# =============================================================================

UPCOMING_PROJECT_PARAM_SCHEMA = ParamSchema(
    fields={},  # project_name comes from URL path
    aliases={}
)

UPCOMING_PROJECT_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
    }
)

UPCOMING_PROJECT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

UPCOMING_PROJECT_CONTRACT = EndpointContract(
    endpoint="upcoming-launches/project",
    version="v3",
    param_schema=UPCOMING_PROJECT_PARAM_SCHEMA,
    service_schema=UPCOMING_PROJECT_SERVICE_SCHEMA,
    response_schema=UPCOMING_PROJECT_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(UPCOMING_PROJECT_CONTRACT)


# =============================================================================
# /upcoming-launches/stats
# =============================================================================

UPCOMING_STATS_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

UPCOMING_STATS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

UPCOMING_STATS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

UPCOMING_STATS_CONTRACT = EndpointContract(
    endpoint="upcoming-launches/stats",
    version="v3",
    param_schema=UPCOMING_STATS_PARAM_SCHEMA,
    service_schema=UPCOMING_STATS_SERVICE_SCHEMA,
    response_schema=UPCOMING_STATS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(UPCOMING_STATS_CONTRACT)


# =============================================================================
# /upcoming-launches/needs-review
# =============================================================================

UPCOMING_NEEDS_REVIEW_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

UPCOMING_NEEDS_REVIEW_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

UPCOMING_NEEDS_REVIEW_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

UPCOMING_NEEDS_REVIEW_CONTRACT = EndpointContract(
    endpoint="upcoming-launches/needs-review",
    version="v3",
    param_schema=UPCOMING_NEEDS_REVIEW_PARAM_SCHEMA,
    service_schema=UPCOMING_NEEDS_REVIEW_SERVICE_SCHEMA,
    response_schema=UPCOMING_NEEDS_REVIEW_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(UPCOMING_NEEDS_REVIEW_CONTRACT)
