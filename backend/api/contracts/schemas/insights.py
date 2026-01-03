"""
Contract schemas for /insights/* endpoints.

Visual Analytics endpoints for the Insights page.

Endpoints:
- GET /api/insights/district-psf
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
    make_meta_fields,
    make_required_meta,
)


# =============================================================================
# /insights/district-psf
# =============================================================================

DISTRICT_PSF_PARAM_SCHEMA = ParamSchema(
    fields={
        "timeframe": FieldSpec(
            name="timeframe",
            type=str,
            default="Y1",  # Default to last 12 months for performance
            allowed_values=["all", "M3", "M6", "Y1", "Y3", "Y5",
                           "3m", "6m", "12m", "1y", "2y", "3y", "5y"],
            description="Time period filter (default: Y1 = last 12 months)"
        ),
        "period": FieldSpec(
            name="period",
            type=str,
            default=None,
            allowed_values=["3m", "6m", "12m", "1y", "2y", "3y", "5y", "all"],
            description="[DEPRECATED] Use 'timeframe' instead"
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
    meta_fields=make_meta_fields(
        FieldSpec(name="period", type=str, required=False),
        FieldSpec(name="bed_filter", type=str, required=False),
        FieldSpec(name="total_districts", type=int, required=False),
        FieldSpec(name="districts_with_data", type=int, required=False),
    ),
    required_meta=make_required_meta(),
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
# /insights/district-liquidity
# =============================================================================

DISTRICT_LIQUIDITY_PARAM_SCHEMA = ParamSchema(
    fields={
        "timeframe": FieldSpec(
            name="timeframe",
            type=str,
            default="Y1",  # Default to last 12 months for performance
            allowed_values=["all", "M3", "M6", "Y1", "Y3", "Y5",
                           "3m", "6m", "12m", "1y", "2y", "3y", "5y"],
            description="Time period filter (default: Y1 = last 12 months)"
        ),
        "period": FieldSpec(
            name="period",
            type=str,
            default=None,
            allowed_values=["3m", "6m", "12m", "1y", "2y", "3y", "5y", "all"],
            description="[DEPRECATED] Use 'timeframe' instead"
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
    meta_fields=make_meta_fields(
        FieldSpec(name="period", type=str, required=False),
        FieldSpec(name="months_in_period", type=int, required=False),
        FieldSpec(name="total_transactions", type=int, required=False),
        FieldSpec(name="mean_velocity", type=float, required=False),
    ),
    required_meta=make_required_meta(),
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
