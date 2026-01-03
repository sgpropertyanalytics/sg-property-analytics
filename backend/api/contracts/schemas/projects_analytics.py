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
    make_meta_fields,
    make_required_meta,
)


# =============================================================================
# /projects/<project_name>/inventory
# =============================================================================

PROJECT_INVENTORY_PARAM_SCHEMA = ParamSchema(
    fields={
        "project_name": FieldSpec(
            name="project_name",
            type=str,
            required=True,
            description="Project name from URL path"
        ),
    },
    aliases={}
)

PROJECT_INVENTORY_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
    }
)

PROJECT_INVENTORY_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
        "cumulative_new_sales": FieldSpec(name="cumulative_new_sales", type=int, required=True),
        "cumulative_resales": FieldSpec(name="cumulative_resales", type=int, required=False),
        "total_transactions": FieldSpec(name="total_transactions", type=int, required=False),
        "total_units": FieldSpec(name="total_units", type=int, required=False),
        "estimated_unsold": FieldSpec(name="estimated_unsold", type=int, required=False),
        "percent_sold": FieldSpec(name="percent_sold", type=float, required=False),
        "data_source": FieldSpec(name="data_source", type=str, required=False),
        "message": FieldSpec(name="message", type=str, required=False),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
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
        "project_name": FieldSpec(
            name="project_name",
            type=str,
            required=True,
            description="Project name from URL path"
        ),
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
    },
    aliases={}
)

PROJECT_PRICE_BANDS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
        "window_months": FieldSpec(name="window_months", type=int, default=24),
        "unit_psf": FieldSpec(name="unit_psf", type=float),
    }
)

PROJECT_PRICE_BANDS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "projectName": FieldSpec(name="projectName", type=str, required=False),
        "dataSource": FieldSpec(name="dataSource", type=str, required=False),
        "proxyLabel": FieldSpec(name="proxyLabel", type=str, required=False),
        "bands": FieldSpec(name="bands", type=list, required=False),
        "latest": FieldSpec(name="latest", type=dict, required=False),
        "trend": FieldSpec(name="trend", type=dict, required=False),
        "verdict": FieldSpec(name="verdict", type=dict, required=False),
        "dataQuality": FieldSpec(name="dataQuality", type=dict, required=False),
        "error": FieldSpec(name="error", type=str, required=False),
        "apiContractVersion": FieldSpec(name="apiContractVersion", type=str, required=False),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
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
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
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
        "project_name": FieldSpec(
            name="project_name",
            type=str,
            required=True,
            description="Project name from URL path"
        ),
    },
    aliases={}
)

PROJECT_EXIT_QUEUE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
    }
)

PROJECT_EXIT_QUEUE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "projectName": FieldSpec(name="projectName", type=str, required=False),
        "dataQuality": FieldSpec(name="dataQuality", type=dict, required=False),
        "fundamentals": FieldSpec(name="fundamentals", type=dict, required=False),
        "resaleMetrics": FieldSpec(name="resaleMetrics", type=dict, required=False),
        "riskAssessment": FieldSpec(name="riskAssessment", type=dict, required=False),
        "gatingFlags": FieldSpec(name="gatingFlags", type=dict, required=False),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
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
