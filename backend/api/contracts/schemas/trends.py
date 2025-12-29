"""
Contract schemas for trend endpoints.

Active endpoint:
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
    data_fields={
        "chartData": FieldSpec(name="chartData", type=list, required=False),
        "summary": FieldSpec(name="summary", type=dict, required=False),
        "appliedFilters": FieldSpec(name="appliedFilters", type=dict, required=False),
    },
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
