"""
Contract schemas for /projects/* analytics endpoints.

Project-specific analysis endpoints for inventory, price bands, and exit queue.

Endpoints:
- GET /api/projects/<project_name>/inventory
- GET /api/projects/<project_name>/price-bands
- GET /api/projects/resale-projects
- GET /api/projects/<project_name>/exit-queue
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
# /projects/<project_name>/inventory
# =============================================================================

PROJECT_INVENTORY_PARAM_SCHEMA = ParamSchema(
    fields={},  # project_name comes from URL path
    aliases={}
)

PROJECT_INVENTORY_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
    }
)

PROJECT_INVENTORY_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECT_INVENTORY_CONTRACT = EndpointContract(
    endpoint="projects/inventory",
    version="v3",
    param_schema=PROJECT_INVENTORY_PARAM_SCHEMA,
    service_schema=PROJECT_INVENTORY_SERVICE_SCHEMA,
    response_schema=PROJECT_INVENTORY_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECT_INVENTORY_CONTRACT)


# =============================================================================
# /projects/<project_name>/price-bands
# =============================================================================

PROJECT_PRICE_BANDS_PARAM_SCHEMA = ParamSchema(
    fields={
        "window_months": FieldSpec(
            name="window_months",
            type=int,
            default=24,
            description="Analysis window in months (6-60)"
        ),
        "unit_psf": FieldSpec(
            name="unit_psf",
            type=float,
            description="User's unit PSF for verdict calculation (300-10000)"
        ),
        "schema": FieldSpec(
            name="schema",
            type=str,
            allowed_values=["v2"],
            description="'v2' for strict camelCase only"
        ),
    },
    aliases={}
)

PROJECT_PRICE_BANDS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
        "window_months": FieldSpec(name="window_months", type=int, default=24),
        "unit_psf": FieldSpec(name="unit_psf", type=float),
        "strict_v2": FieldSpec(name="strict_v2", type=bool, default=False),
    }
)

PROJECT_PRICE_BANDS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECT_PRICE_BANDS_CONTRACT = EndpointContract(
    endpoint="projects/price-bands",
    version="v3",
    param_schema=PROJECT_PRICE_BANDS_PARAM_SCHEMA,
    service_schema=PROJECT_PRICE_BANDS_SERVICE_SCHEMA,
    response_schema=PROJECT_PRICE_BANDS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECT_PRICE_BANDS_CONTRACT)


# =============================================================================
# /projects/resale-projects
# =============================================================================

RESALE_PROJECTS_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

RESALE_PROJECTS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

RESALE_PROJECTS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

RESALE_PROJECTS_CONTRACT = EndpointContract(
    endpoint="projects/resale-projects",
    version="v3",
    param_schema=RESALE_PROJECTS_PARAM_SCHEMA,
    service_schema=RESALE_PROJECTS_SERVICE_SCHEMA,
    response_schema=RESALE_PROJECTS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(RESALE_PROJECTS_CONTRACT)


# =============================================================================
# /projects/<project_name>/exit-queue
# =============================================================================

PROJECT_EXIT_QUEUE_PARAM_SCHEMA = ParamSchema(
    fields={
        "v2": FieldSpec(
            name="v2",
            type=str,
            default="true",
            allowed_values=["true", "false"],
            description="Include _v2 nested object with camelCase keys"
        ),
    },
    aliases={}
)

PROJECT_EXIT_QUEUE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
        "include_v2": FieldSpec(name="include_v2", type=bool, default=True),
    }
)

PROJECT_EXIT_QUEUE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECT_EXIT_QUEUE_CONTRACT = EndpointContract(
    endpoint="projects/exit-queue",
    version="v3",
    param_schema=PROJECT_EXIT_QUEUE_PARAM_SCHEMA,
    service_schema=PROJECT_EXIT_QUEUE_SERVICE_SCHEMA,
    response_schema=PROJECT_EXIT_QUEUE_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECT_EXIT_QUEUE_CONTRACT)
