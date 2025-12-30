"""
Contract schema for /analytics/new-launch-timeline endpoint.

Provides aggregated data about new launch projects over time.

Endpoint: GET /api/analytics/new-launch-timeline
"""

from datetime import date

from ..registry import (
    EndpointContract,
    ParamSchema,
    ServiceBoundarySchema,
    ResponseSchema,
    FieldSpec,
    register_contract,
)


# =============================================================================
# PARAM SCHEMA - What frontend sends (aligned with existing conventions)
# =============================================================================

NEW_LAUNCH_TIMELINE_PARAM_SCHEMA = ParamSchema(
    fields={
        # Time grouping
        "time_grain": FieldSpec(
            name="time_grain",
            type=str,
            required=False,
            default="quarter",
            allowed_values=["month", "quarter", "year"],
            description="Time grouping: month, quarter, or year"
        ),

        # Filters - use same patterns as aggregate.py
        # Normalizer converts: district -> districts, segment -> segments, bedroom -> bedrooms
        "district": FieldSpec(
            name="district",
            type=str,
            nullable=True,
            description="Comma-separated district codes (D01, D02, or just 1, 2)"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter (CCR, RCR, OCR)"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            nullable=True,
            description="Comma-separated bedroom counts (2, 3, 4)"
        ),

        # Date range - normalizer converts date_to -> date_to_exclusive
        "date_from": FieldSpec(
            name="date_from",
            type=date,
            nullable=True,
            description="Start date (inclusive) for launch_date filter, YYYY-MM-DD"
        ),
        "date_to": FieldSpec(
            name="date_to",
            type=date,
            nullable=True,
            description="End date (inclusive) for launch_date filter, YYYY-MM-DD"
        ),
    },
    aliases={
        # Frontend may send camelCase
        "timeGrain": "time_grain",
        "dateFrom": "date_from",
        "dateTo": "date_to",
    }
)


# =============================================================================
# SERVICE BOUNDARY SCHEMA - What service receives after normalization
# =============================================================================

NEW_LAUNCH_TIMELINE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "time_grain": FieldSpec(name="time_grain", type=str, default="quarter"),
        # Pluralized by normalizer
        "districts": FieldSpec(name="districts", type=list, nullable=True),
        "segments": FieldSpec(name="segments", type=list, nullable=True),
        "bedrooms": FieldSpec(name="bedrooms", type=list, nullable=True),
        # Exclusive bound converted by normalizer
        "date_from": FieldSpec(name="date_from", type=date, nullable=True),
        "date_to_exclusive": FieldSpec(name="date_to_exclusive", type=date, nullable=True),
    }
)


# =============================================================================
# RESPONSE SCHEMA - What endpoint returns (minimal, aligned with wrapper)
# =============================================================================

NEW_LAUNCH_TIMELINE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "periodStart": FieldSpec(
            name="periodStart",
            type=str,
            required=True,
            description="ISO date string for period start (e.g., '2024-01-01')"
        ),
        "projectCount": FieldSpec(
            name="projectCount",
            type=int,
            required=True,
            description="Number of projects launched in this period"
        ),
        "totalUnits": FieldSpec(
            name="totalUnits",
            type=int,
            required=True,
            description="Total units launched in this period"
        ),
    },
    # Standard meta fields injected by @api_contract wrapper
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=True,
)


# =============================================================================
# REGISTER CONTRACT
# =============================================================================

NEW_LAUNCH_TIMELINE_CONTRACT = EndpointContract(
    endpoint="new-launch-timeline",
    version="v1",
    param_schema=NEW_LAUNCH_TIMELINE_PARAM_SCHEMA,
    service_schema=NEW_LAUNCH_TIMELINE_SERVICE_SCHEMA,
    response_schema=NEW_LAUNCH_TIMELINE_RESPONSE_SCHEMA,
)

# Register on import
register_contract(NEW_LAUNCH_TIMELINE_CONTRACT)
