"""
Contract schemas for trend endpoints.

Time-series trend endpoints.

Endpoints:
- GET /api/price_trends_by_district
- GET /api/market_stats_by_district
- GET /api/sale_type_trends
- GET /api/price_trends_by_sale_type
- GET /api/price_trends_by_region
- GET /api/psf_trends_by_region
- GET /api/new-vs-resale
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
# /price_trends_by_district
# =============================================================================

PRICE_TRENDS_BY_DISTRICT_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

PRICE_TRENDS_BY_DISTRICT_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

PRICE_TRENDS_BY_DISTRICT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PRICE_TRENDS_BY_DISTRICT_CONTRACT = EndpointContract(
    endpoint="trends/price-trends-by-district",
    version="v3",
    param_schema=PRICE_TRENDS_BY_DISTRICT_PARAM_SCHEMA,
    service_schema=PRICE_TRENDS_BY_DISTRICT_SERVICE_SCHEMA,
    response_schema=PRICE_TRENDS_BY_DISTRICT_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PRICE_TRENDS_BY_DISTRICT_CONTRACT)


# =============================================================================
# /market_stats_by_district
# =============================================================================

MARKET_STATS_BY_DISTRICT_PARAM_SCHEMA = ParamSchema(
    fields={
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            default="2,3,4",
            description="Comma-separated bedroom counts"
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

MARKET_STATS_BY_DISTRICT_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "bedroom_types": FieldSpec(name="bedroom_types", type=list, default=[2, 3, 4]),
        "districts": FieldSpec(name="districts", type=list),
        "segment": FieldSpec(name="segment", type=str),
        "short_months": FieldSpec(name="short_months", type=int, default=3),
        "long_months": FieldSpec(name="long_months", type=int, default=15),
    }
)

MARKET_STATS_BY_DISTRICT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

MARKET_STATS_BY_DISTRICT_CONTRACT = EndpointContract(
    endpoint="trends/market-stats-by-district",
    version="v3",
    param_schema=MARKET_STATS_BY_DISTRICT_PARAM_SCHEMA,
    service_schema=MARKET_STATS_BY_DISTRICT_SERVICE_SCHEMA,
    response_schema=MARKET_STATS_BY_DISTRICT_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(MARKET_STATS_BY_DISTRICT_CONTRACT)


# =============================================================================
# /sale_type_trends
# =============================================================================

SALE_TYPE_TRENDS_PARAM_SCHEMA = ParamSchema(
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

SALE_TYPE_TRENDS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "districts": FieldSpec(name="districts", type=list),
        "segment": FieldSpec(name="segment", type=str),
    }
)

SALE_TYPE_TRENDS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

SALE_TYPE_TRENDS_CONTRACT = EndpointContract(
    endpoint="trends/sale-type-trends",
    version="v3",
    param_schema=SALE_TYPE_TRENDS_PARAM_SCHEMA,
    service_schema=SALE_TYPE_TRENDS_SERVICE_SCHEMA,
    response_schema=SALE_TYPE_TRENDS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(SALE_TYPE_TRENDS_CONTRACT)


# =============================================================================
# /price_trends_by_sale_type
# =============================================================================

PRICE_TRENDS_BY_SALE_TYPE_PARAM_SCHEMA = ParamSchema(
    fields={
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            default="2,3,4",
            description="Comma-separated bedroom counts"
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
    },
    aliases={}
)

PRICE_TRENDS_BY_SALE_TYPE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "bedroom_types": FieldSpec(name="bedroom_types", type=list, default=[2, 3, 4]),
        "districts": FieldSpec(name="districts", type=list),
        "segment": FieldSpec(name="segment", type=str),
    }
)

PRICE_TRENDS_BY_SALE_TYPE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PRICE_TRENDS_BY_SALE_TYPE_CONTRACT = EndpointContract(
    endpoint="trends/price-trends-by-sale-type",
    version="v3",
    param_schema=PRICE_TRENDS_BY_SALE_TYPE_PARAM_SCHEMA,
    service_schema=PRICE_TRENDS_BY_SALE_TYPE_SERVICE_SCHEMA,
    response_schema=PRICE_TRENDS_BY_SALE_TYPE_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PRICE_TRENDS_BY_SALE_TYPE_CONTRACT)


# =============================================================================
# /price_trends_by_region
# =============================================================================

PRICE_TRENDS_BY_REGION_PARAM_SCHEMA = ParamSchema(
    fields={
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            default="2,3,4",
            description="Comma-separated bedroom counts"
        ),
    },
    aliases={}
)

PRICE_TRENDS_BY_REGION_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "bedroom_types": FieldSpec(name="bedroom_types", type=list, default=[2, 3, 4]),
    }
)

PRICE_TRENDS_BY_REGION_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PRICE_TRENDS_BY_REGION_CONTRACT = EndpointContract(
    endpoint="trends/price-trends-by-region",
    version="v3",
    param_schema=PRICE_TRENDS_BY_REGION_PARAM_SCHEMA,
    service_schema=PRICE_TRENDS_BY_REGION_SERVICE_SCHEMA,
    response_schema=PRICE_TRENDS_BY_REGION_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PRICE_TRENDS_BY_REGION_CONTRACT)


# =============================================================================
# /psf_trends_by_region
# =============================================================================

PSF_TRENDS_BY_REGION_PARAM_SCHEMA = ParamSchema(
    fields={
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            default="2,3,4",
            description="Comma-separated bedroom counts"
        ),
    },
    aliases={}
)

PSF_TRENDS_BY_REGION_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "bedroom_types": FieldSpec(name="bedroom_types", type=list, default=[2, 3, 4]),
    }
)

PSF_TRENDS_BY_REGION_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PSF_TRENDS_BY_REGION_CONTRACT = EndpointContract(
    endpoint="trends/psf-trends-by-region",
    version="v3",
    param_schema=PSF_TRENDS_BY_REGION_PARAM_SCHEMA,
    service_schema=PSF_TRENDS_BY_REGION_SERVICE_SCHEMA,
    response_schema=PSF_TRENDS_BY_REGION_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PSF_TRENDS_BY_REGION_CONTRACT)


# =============================================================================
# /new-vs-resale
# =============================================================================

NEW_VS_RESALE_PARAM_SCHEMA = ParamSchema(
    fields={
        "district": FieldSpec(
            name="district",
            type=str,
            description="Comma-separated districts"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            description="Comma-separated bedroom counts"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment"
        ),
        "date_from": FieldSpec(
            name="date_from",
            type=str,
            description="Start date (YYYY-MM-DD)"
        ),
        "date_to": FieldSpec(
            name="date_to",
            type=str,
            description="End date (YYYY-MM-DD)"
        ),
        "timeGrain": FieldSpec(
            name="timeGrain",
            type=str,
            default="quarter",
            allowed_values=["year", "quarter", "month"],
            description="Time aggregation level"
        ),
    },
    aliases={}
)

NEW_VS_RESALE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "districts": FieldSpec(name="districts", type=list),
        "bedrooms": FieldSpec(name="bedrooms", type=list),
        "segment": FieldSpec(name="segment", type=str),
        "date_from": FieldSpec(name="date_from", type=str),
        "date_to": FieldSpec(name="date_to", type=str),
        "time_grain": FieldSpec(name="time_grain", type=str, default="quarter"),
    }
)

NEW_VS_RESALE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

NEW_VS_RESALE_CONTRACT = EndpointContract(
    endpoint="trends/new-vs-resale",
    version="v3",
    param_schema=NEW_VS_RESALE_PARAM_SCHEMA,
    service_schema=NEW_VS_RESALE_SERVICE_SCHEMA,
    response_schema=NEW_VS_RESALE_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(NEW_VS_RESALE_CONTRACT)
