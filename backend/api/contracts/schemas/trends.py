"""
Contract schemas for trend endpoints.

Active endpoint:
- GET /api/new-vs-resale
"""

from datetime import date

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
from ..pydantic_models import NewVsResaleParams


# =============================================================================
# /new-vs-resale
# =============================================================================

NEW_VS_RESALE_PARAM_SCHEMA = ParamSchema(
    fields={
        # Time filter (unified) - CRITICAL: Must match aggregate.py pattern
        # Frontend sends timeframe ID; backend resolves to date bounds
        # This takes precedence over explicit date_from/date_to
        "timeframe": FieldSpec(
            name="timeframe",
            type=str,
            nullable=True,
            default=None,
            allowed_values=["M3", "M6", "Y1", "Y3", "Y5", "all", "3m", "6m", "12m", "1y", "2y", "3y", "5y"],
            description="Timeframe preset (M3, M6, Y1, Y3, Y5, all). Takes precedence over date_from/date_to."
        ),
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
        # Date range (explicit dates - used when timeframe not provided)
        "date_from": FieldSpec(
            name="date_from",
            type=date,
            nullable=True,
            description="Start date (YYYY-MM-DD). Ignored if timeframe is set."
        ),
        "date_to": FieldSpec(
            name="date_to",
            type=date,
            nullable=True,
            description="End date (YYYY-MM-DD). Ignored if timeframe is set."
        ),
        "time_grain": FieldSpec(
            name="time_grain",
            type=str,
            default="quarter",
            allowed_values=["year", "quarter", "month"],
            description="Time aggregation level"
        ),
    },
    aliases={
        "dateFrom": "date_from",
        "dateTo": "date_to",
        "timeGrain": "time_grain",
    }
)

NEW_VS_RESALE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "districts": FieldSpec(name="districts", type=list, nullable=True),
        "bedrooms": FieldSpec(name="bedrooms", type=list, nullable=True),
        "segment": FieldSpec(name="segment", type=str, nullable=True),
        "date_from": FieldSpec(name="date_from", type=date, nullable=True),
        # Normalizer converts timeframe -> date_to_exclusive (exclusive bound)
        "date_to_exclusive": FieldSpec(name="date_to_exclusive", type=date, nullable=True),
        "time_grain": FieldSpec(name="time_grain", type=str, default="quarter"),
    }
)

NEW_VS_RESALE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "chartData": FieldSpec(name="chartData", type=list, required=False),
        "summary": FieldSpec(name="summary", type=dict, required=False),
        "appliedFilters": FieldSpec(name="appliedFilters", type=dict, required=False),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

NEW_VS_RESALE_CONTRACT = EndpointContract(
    endpoint="trends/new-vs-resale",
    version="v3",
    param_schema=NEW_VS_RESALE_PARAM_SCHEMA,
    service_schema=NEW_VS_RESALE_SERVICE_SCHEMA,
    response_schema=NEW_VS_RESALE_RESPONSE_SCHEMA,
    pydantic_model=NewVsResaleParams,
    mode=SchemaMode.WARN,
)

register_contract(NEW_VS_RESALE_CONTRACT)
