"""
Contract schemas for /insights/* endpoints.

Visual Analytics endpoints for the Insights page.

Endpoints:
- GET /api/insights/district-psf
- GET /api/insights/district-summary
- GET /api/insights/district-liquidity
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
# /insights/district-psf
# =============================================================================

DISTRICT_PSF_PARAM_SCHEMA = ParamSchema(
    fields={
        "period": FieldSpec(
            name="period",
            type=str,
            default="12m",
            allowed_values=["3m", "6m", "12m", "all"],
            description="Time period filter"
        ),
        "bed": FieldSpec(
            name="bed",
            type=str,
            default="all",
            allowed_values=["all", "1", "2", "3", "4", "4+", "5"],
            description="Bedroom filter"
        ),
        "age": FieldSpec(
            name="age",
            type=str,
            default="all",
            allowed_values=["all", "new", "young", "resale"],
            description="Property age filter (deprecated - use sale_type)"
        ),
        "sale_type": FieldSpec(
            name="sale_type",
            type=str,
            default="all",
            allowed_values=["all", "new_sale", "resale"],
            description="Sale type filter"
        ),
    },
    aliases={
        "saleType": "sale_type",
    }
)

DISTRICT_PSF_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "period": FieldSpec(name="period", type=str, default="12m"),
        "bed": FieldSpec(name="bed", type=str, default="all"),
        "age": FieldSpec(name="age", type=str, default="all"),
        "sale_type": FieldSpec(name="sale_type", type=str, default="all"),
    }
)

DISTRICT_PSF_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # Response has "districts" array, not "data"
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
        "period": FieldSpec(name="period", type=str, required=False),
        "bed_filter": FieldSpec(name="bed_filter", type=str, required=False),
        "total_districts": FieldSpec(name="total_districts", type=int, required=False),
        "districts_with_data": FieldSpec(name="districts_with_data", type=int, required=False),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

DISTRICT_PSF_CONTRACT = EndpointContract(
    endpoint="insights/district-psf",
    version="v3",
    param_schema=DISTRICT_PSF_PARAM_SCHEMA,
    service_schema=DISTRICT_PSF_SERVICE_SCHEMA,
    response_schema=DISTRICT_PSF_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(DISTRICT_PSF_CONTRACT)


# =============================================================================
# /insights/district-summary
# =============================================================================

DISTRICT_SUMMARY_PARAM_SCHEMA = ParamSchema(
    fields={
        "district": FieldSpec(
            name="district",
            type=str,
            required=True,
            description="District ID (e.g., D09)"
        ),
        "period": FieldSpec(
            name="period",
            type=str,
            default="12m",
            allowed_values=["3m", "6m", "12m", "all"],
            description="Time period filter"
        ),
        "bed": FieldSpec(
            name="bed",
            type=str,
            default="all",
            allowed_values=["all", "1", "2", "3", "4", "4+"],
            description="Bedroom filter"
        ),
    },
    aliases={}
)

DISTRICT_SUMMARY_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "district": FieldSpec(name="district", type=str, required=True),
        "period": FieldSpec(name="period", type=str, default="12m"),
        "bed": FieldSpec(name="bed", type=str, default="all"),
    }
)

DISTRICT_SUMMARY_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # Response is flat object with stats, bedroom_breakdown, top_projects
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
        "period": FieldSpec(name="period", type=str, required=False),
        "bed_filter": FieldSpec(name="bed_filter", type=str, required=False),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

DISTRICT_SUMMARY_CONTRACT = EndpointContract(
    endpoint="insights/district-summary",
    version="v3",
    param_schema=DISTRICT_SUMMARY_PARAM_SCHEMA,
    service_schema=DISTRICT_SUMMARY_SERVICE_SCHEMA,
    response_schema=DISTRICT_SUMMARY_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(DISTRICT_SUMMARY_CONTRACT)


# =============================================================================
# /insights/district-liquidity
# =============================================================================

DISTRICT_LIQUIDITY_PARAM_SCHEMA = ParamSchema(
    fields={
        "period": FieldSpec(
            name="period",
            type=str,
            default="12m",
            allowed_values=["3m", "6m", "12m", "all"],
            description="Time period filter"
        ),
        "bed": FieldSpec(
            name="bed",
            type=str,
            default="all",
            allowed_values=["all", "1", "2", "3", "4", "5"],
            description="Bedroom filter"
        ),
        "sale_type": FieldSpec(
            name="sale_type",
            type=str,
            default="all",
            description="Sale type filter"
        ),
    },
    aliases={
        "saleType": "sale_type",
    }
)

DISTRICT_LIQUIDITY_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "period": FieldSpec(name="period", type=str, default="12m"),
        "bed": FieldSpec(name="bed", type=str, default="all"),
        "sale_type": FieldSpec(name="sale_type", type=str, default="all"),
    }
)

DISTRICT_LIQUIDITY_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # Response has "districts" array with liquidity_metrics
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
        "period": FieldSpec(name="period", type=str, required=False),
        "months_in_period": FieldSpec(name="months_in_period", type=int, required=False),
        "total_transactions": FieldSpec(name="total_transactions", type=int, required=False),
        "mean_velocity": FieldSpec(name="mean_velocity", type=float, required=False),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

DISTRICT_LIQUIDITY_CONTRACT = EndpointContract(
    endpoint="insights/district-liquidity",
    version="v3",
    param_schema=DISTRICT_LIQUIDITY_PARAM_SCHEMA,
    service_schema=DISTRICT_LIQUIDITY_SERVICE_SCHEMA,
    response_schema=DISTRICT_LIQUIDITY_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(DISTRICT_LIQUIDITY_CONTRACT)
