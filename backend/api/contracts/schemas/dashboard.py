"""
Contract schema for /dashboard endpoint.

Unified dashboard endpoint that returns multiple chart panels in one response.

Endpoint: GET/POST /api/dashboard
"""

from datetime import date

from api.contracts.contract_schema import SaleType, Tenure
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
# PARAM SCHEMA - What frontend sends
# =============================================================================

DASHBOARD_PARAM_SCHEMA = ParamSchema(
    fields={
        # Time filter (unified)
        # Frontend sends timeframe ID; backend resolves to date bounds
        "timeframe": FieldSpec(
            name="timeframe",
            type=str,
            nullable=True,
            default=None,
            allowed_values=["M3", "M6", "Y1", "Y3", "Y5", "all", "3m", "6m", "12m", "1y", "2y", "3y", "5y"],
            description="Timeframe preset (M3, M6, Y1, Y3, Y5, all). Takes precedence over date_from/date_to."
        ),

        # Date filters (explicit dates - used when timeframe not provided)
        "date_from": FieldSpec(
            name="date_from",
            type=date,
            nullable=True,
            description="Start date (inclusive), YYYY-MM-DD. Ignored if timeframe is set."
        ),
        "date_to": FieldSpec(
            name="date_to",
            type=date,
            nullable=True,
            description="End date (inclusive), YYYY-MM-DD. Ignored if timeframe is set."
        ),

        # Location filters
        "district": FieldSpec(
            name="district",
            type=str,
            nullable=True,
            description="Comma-separated district codes (D01, D02, ...)"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter (CCR, RCR, OCR)"
        ),

        # Property filters
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            nullable=True,
            description="Comma-separated bedroom counts (2, 3, 4)"
        ),
        "sale_type": FieldSpec(
            name="sale_type",
            type=str,
            nullable=True,
            allowed_values=SaleType.ALL,
            description="Sale type filter (new_sale, resale, sub_sale)"
        ),
        "tenure": FieldSpec(
            name="tenure",
            type=str,
            nullable=True,
            allowed_values=Tenure.ALL,
            description="Tenure filter (freehold, 99_year, 999_year)"
        ),
        "project": FieldSpec(
            name="project",
            type=str,
            nullable=True,
            description="Project name filter (partial match)"
        ),
        "project_exact": FieldSpec(
            name="project_exact",
            type=str,
            nullable=True,
            description="Project name filter (exact match for drill-through)"
        ),

        # Value range filters
        "psf_min": FieldSpec(
            name="psf_min",
            type=float,
            nullable=True,
            description="Minimum PSF filter"
        ),
        "psf_max": FieldSpec(
            name="psf_max",
            type=float,
            nullable=True,
            description="Maximum PSF filter"
        ),
        "size_min": FieldSpec(
            name="size_min",
            type=float,
            nullable=True,
            description="Minimum sqft filter"
        ),
        "size_max": FieldSpec(
            name="size_max",
            type=float,
            nullable=True,
            description="Maximum sqft filter"
        ),

        # Property age filters
        "property_age_min": FieldSpec(
            name="property_age_min",
            type=int,
            nullable=True,
            description="Minimum property age in years"
        ),
        "property_age_max": FieldSpec(
            name="property_age_max",
            type=int,
            nullable=True,
            description="Maximum property age in years"
        ),
        "property_age_bucket": FieldSpec(
            name="property_age_bucket",
            type=str,
            nullable=True,
            description="Property age bucket filter"
        ),

        # Panel selection
        "panels": FieldSpec(
            name="panels",
            type=str,
            nullable=True,
            description="Comma-separated panels: time_series, volume_by_location, price_histogram, bedroom_mix, sale_type_breakdown, summary, beads_chart"
        ),

        # Display options
        "time_grain": FieldSpec(
            name="time_grain",
            type=str,
            default="month",
            allowed_values=["year", "quarter", "month"],
            description="Time granularity for time_series panel"
        ),
        "location_grain": FieldSpec(
            name="location_grain",
            type=str,
            default="region",
            allowed_values=["region", "district", "project"],
            description="Location granularity for volume_by_location panel"
        ),
        "histogram_bins": FieldSpec(
            name="histogram_bins",
            type=int,
            default=20,
            description="Number of bins for price histogram (max 50)"
        ),
        "show_full_range": FieldSpec(
            name="show_full_range",
            type=bool,
            default=False,
            description="Show full date range in time_series"
        ),

        # Caching
        "skip_cache": FieldSpec(
            name="skip_cache",
            type=bool,
            default=False,
            description="Bypass cache if true"
        ),
    },
    aliases={
        # Frontend may send camelCase
        "saleType": "sale_type",
        "dateFrom": "date_from",
        "dateTo": "date_to",
        "psfMin": "psf_min",
        "psfMax": "psf_max",
        "sizeMin": "size_min",
        "sizeMax": "size_max",
        "skipCache": "skip_cache",
        "projectExact": "project_exact",
        "timeGrain": "time_grain",
        "locationGrain": "location_grain",
        "histogramBins": "histogram_bins",
        "showFullRange": "show_full_range",
        "propertyAgeMin": "property_age_min",
        "propertyAgeMax": "property_age_max",
        "propertyAgeBucket": "property_age_bucket",
    }
)


# =============================================================================
# SERVICE BOUNDARY SCHEMA - What service receives after normalization
# =============================================================================

DASHBOARD_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        # Filters (normalized to plurals)
        "districts": FieldSpec(name="districts", type=list, nullable=True),
        "bedrooms": FieldSpec(name="bedrooms", type=list, nullable=True),
        "segments": FieldSpec(name="segments", type=list, nullable=True),
        "date_from": FieldSpec(name="date_from", type=date, nullable=True),
        "date_to": FieldSpec(name="date_to", type=date, nullable=True),
        "sale_type": FieldSpec(name="sale_type", type=str, nullable=True),
        "tenure": FieldSpec(name="tenure", type=str, nullable=True),
        "project": FieldSpec(name="project", type=str, nullable=True),
        "project_exact": FieldSpec(name="project_exact", type=str, nullable=True),
        "psf_min": FieldSpec(name="psf_min", type=float, nullable=True),
        "psf_max": FieldSpec(name="psf_max", type=float, nullable=True),
        "size_min": FieldSpec(name="size_min", type=float, nullable=True),
        "size_max": FieldSpec(name="size_max", type=float, nullable=True),
        "property_age_min": FieldSpec(name="property_age_min", type=int, nullable=True),
        "property_age_max": FieldSpec(name="property_age_max", type=int, nullable=True),
        "property_age_bucket": FieldSpec(name="property_age_bucket", type=str, nullable=True),

        # Options
        "panels": FieldSpec(name="panels", type=list, nullable=True),
        "time_grain": FieldSpec(name="time_grain", type=str, default="month"),
        "location_grain": FieldSpec(name="location_grain", type=str, default="region"),
        "histogram_bins": FieldSpec(name="histogram_bins", type=int, default=20),
        "show_full_range": FieldSpec(name="show_full_range", type=bool, default=False),
        "skip_cache": FieldSpec(name="skip_cache", type=bool, default=False),
    }
)


# =============================================================================
# RESPONSE SCHEMA - What endpoint returns
# =============================================================================

# Dashboard response is complex: data contains multiple panels
# We validate meta fields but allow flexible panel data
DASHBOARD_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # Each panel is optional - depends on panels param
        # We don't strictly validate panel contents
    },
    # Use make_meta_fields() for base meta + endpoint-specific fields
    meta_fields=make_meta_fields(
        FieldSpec(name="cacheHit", type=bool, required=False),
        FieldSpec(name="filtersApplied", type=dict, required=True),
        FieldSpec(name="totalRecordsMatched", type=int, required=False),
        FieldSpec(name="data_masked", type=bool, required=False),
    ),
    required_meta=make_required_meta(),
    data_is_list=False,  # Dashboard data is an object with panel keys
)


# =============================================================================
# REGISTER CONTRACT
# =============================================================================

DASHBOARD_CONTRACT = EndpointContract(
    endpoint="dashboard",
    version="v3",
    param_schema=DASHBOARD_PARAM_SCHEMA,
    service_schema=DASHBOARD_SERVICE_SCHEMA,
    response_schema=DASHBOARD_RESPONSE_SCHEMA,
    serializer=None,  # Uses existing serialize_dashboard_response in route
    mode=SchemaMode.WARN,  # Start in warn mode
)

# Register on import
register_contract(DASHBOARD_CONTRACT)
