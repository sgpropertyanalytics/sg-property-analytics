"""
Contract schema for /analytics/new-launch-absorption endpoint.

Provides launch-month absorption rates for new launch projects over time.

Endpoint: GET /api/analytics/new-launch-absorption
"""

from datetime import date

from ..registry import (
    EndpointContract,
    ParamSchema,
    ServiceBoundarySchema,
    ResponseSchema,
    FieldSpec,
    register_contract,
    make_meta_fields,
    make_required_meta,
)
from ..pydantic_models import NewLaunchAbsorptionParams


# =============================================================================
# PARAM SCHEMA - What frontend sends (aligned with new_launch_timeline)
# =============================================================================

NEW_LAUNCH_ABSORPTION_PARAM_SCHEMA = ParamSchema(
    fields={
        "time_grain": FieldSpec(
            name="time_grain",
            type=str,
            required=False,
            default="quarter",
            allowed_values=["month", "quarter", "year"],
            description="Time grouping: month, quarter, or year"
        ),
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
            nullable=True,
            description="Comma-separated district codes (D01,D02 or 1,2 - normalized to Dxx)"
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
            description="Comma-separated bedroom counts (1,2,3 - normalized to List[int])"
        ),
        # Date range (explicit dates - used when timeframe not provided)
        "date_from": FieldSpec(
            name="date_from",
            type=date,
            nullable=True,
            description="Start date (inclusive) for launch_date filter, YYYY-MM-DD. Ignored if timeframe is set."
        ),
        "date_to": FieldSpec(
            name="date_to",
            type=date,
            nullable=True,
            description="End date (inclusive, converted to exclusive+1day by normalizer), YYYY-MM-DD. Ignored if timeframe is set."
        ),
    },
    aliases={
        # CamelCase aliases
        "timeGrain": "time_grain",
        "dateFrom": "date_from",
        "dateTo": "date_to",
        # Plural aliases for back-compat with mixed callers
        "districts": "district",
        "segments": "segment",
        "bedrooms": "bedroom",
    }
)


# =============================================================================
# SERVICE BOUNDARY SCHEMA - What service receives after normalization
# =============================================================================

NEW_LAUNCH_ABSORPTION_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "time_grain": FieldSpec(name="time_grain", type=str, default="quarter"),
        # Pluralized by normalizer: district -> districts (List[str])
        "districts": FieldSpec(name="districts", type=list, nullable=True),
        "segments": FieldSpec(name="segments", type=list, nullable=True),
        "bedrooms": FieldSpec(name="bedrooms", type=list, nullable=True),
        "date_from": FieldSpec(name="date_from", type=date, nullable=True),
        # Exclusive bound: date_to + 1 day (computed by normalizer)
        "date_to_exclusive": FieldSpec(name="date_to_exclusive", type=date, nullable=True),
    }
)


# =============================================================================
# RESPONSE SCHEMA - What endpoint returns
# =============================================================================

NEW_LAUNCH_ABSORPTION_RESPONSE_SCHEMA = ResponseSchema(
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
        "avgAbsorption": FieldSpec(
            name="avgAbsorption",
            type=float,
            nullable=True,
            description="Average launch-month absorption % (0-100), null if no data"
        ),
        "projectsWithUnits": FieldSpec(
            name="projectsWithUnits",
            type=int,
            required=True,
            description="Projects with valid total_units data"
        ),
        "projectsMissing": FieldSpec(
            name="projectsMissing",
            type=int,
            required=True,
            description="Projects missing total_units data (excluded from average)"
        ),
    },
    # Standard meta fields injected by @api_contract wrapper
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=True,
)


# =============================================================================
# REGISTER CONTRACT
# =============================================================================

NEW_LAUNCH_ABSORPTION_CONTRACT = EndpointContract(
    endpoint="new-launch-absorption",
    version="v1",
    response_schema=NEW_LAUNCH_ABSORPTION_RESPONSE_SCHEMA,
    pydantic_model=NewLaunchAbsorptionParams,
)

register_contract(NEW_LAUNCH_ABSORPTION_CONTRACT)
