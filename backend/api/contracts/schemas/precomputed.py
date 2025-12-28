"""
Contract schemas for precomputed stats endpoints.

Legacy endpoints reading from precomputed_stats table.

Endpoints:
- GET /api/resale_stats
- GET /api/price_trends
- GET /api/total_volume
- GET /api/avg_psf
- GET /api/districts
- GET /api/market_stats
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
# /resale_stats
# =============================================================================

RESALE_STATS_PARAM_SCHEMA = ParamSchema(
    fields={
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
    },
    aliases={}
)

RESALE_STATS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "districts": FieldSpec(name="districts", type=str),
        "segment": FieldSpec(name="segment", type=str),
    }
)

RESALE_STATS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

RESALE_STATS_CONTRACT = EndpointContract(
    endpoint="precomputed/resale-stats",
    version="v3",
    param_schema=RESALE_STATS_PARAM_SCHEMA,
    service_schema=RESALE_STATS_SERVICE_SCHEMA,
    response_schema=RESALE_STATS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(RESALE_STATS_CONTRACT)


# =============================================================================
# /price_trends
# =============================================================================

PRICE_TRENDS_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

PRICE_TRENDS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

PRICE_TRENDS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PRICE_TRENDS_CONTRACT = EndpointContract(
    endpoint="precomputed/price-trends",
    version="v3",
    param_schema=PRICE_TRENDS_PARAM_SCHEMA,
    service_schema=PRICE_TRENDS_SERVICE_SCHEMA,
    response_schema=PRICE_TRENDS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PRICE_TRENDS_CONTRACT)


# =============================================================================
# /total_volume
# =============================================================================

TOTAL_VOLUME_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

TOTAL_VOLUME_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

TOTAL_VOLUME_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

TOTAL_VOLUME_CONTRACT = EndpointContract(
    endpoint="precomputed/total-volume",
    version="v3",
    param_schema=TOTAL_VOLUME_PARAM_SCHEMA,
    service_schema=TOTAL_VOLUME_SERVICE_SCHEMA,
    response_schema=TOTAL_VOLUME_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(TOTAL_VOLUME_CONTRACT)


# =============================================================================
# /avg_psf
# =============================================================================

AVG_PSF_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

AVG_PSF_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

AVG_PSF_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

AVG_PSF_CONTRACT = EndpointContract(
    endpoint="precomputed/avg-psf",
    version="v3",
    param_schema=AVG_PSF_PARAM_SCHEMA,
    service_schema=AVG_PSF_SERVICE_SCHEMA,
    response_schema=AVG_PSF_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(AVG_PSF_CONTRACT)


# =============================================================================
# /districts
# =============================================================================

DISTRICTS_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

DISTRICTS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

DISTRICTS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

DISTRICTS_CONTRACT = EndpointContract(
    endpoint="precomputed/districts",
    version="v3",
    param_schema=DISTRICTS_PARAM_SCHEMA,
    service_schema=DISTRICTS_SERVICE_SCHEMA,
    response_schema=DISTRICTS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(DISTRICTS_CONTRACT)


# =============================================================================
# /market_stats
# =============================================================================

MARKET_STATS_PARAM_SCHEMA = ParamSchema(
    fields={
        "segment": FieldSpec(
            name="segment",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment"
        ),
        "short_months": FieldSpec(
            name="short_months",
            type=int,
            default=3,
            description="Short-term period in months"
        ),
        "long_months": FieldSpec(
            name="long_months",
            type=int,
            default=15,
            description="Long-term period in months"
        ),
    },
    aliases={}
)

MARKET_STATS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "segment": FieldSpec(name="segment", type=str),
        "short_months": FieldSpec(name="short_months", type=int, default=3),
        "long_months": FieldSpec(name="long_months", type=int, default=15),
    }
)

MARKET_STATS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

MARKET_STATS_CONTRACT = EndpointContract(
    endpoint="precomputed/market-stats",
    version="v3",
    param_schema=MARKET_STATS_PARAM_SCHEMA,
    service_schema=MARKET_STATS_SERVICE_SCHEMA,
    response_schema=MARKET_STATS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(MARKET_STATS_CONTRACT)
