"""
Contract schema for /dashboard endpoint.

Unified dashboard endpoint that returns multiple chart panels in one response.

Endpoint: GET/POST /api/dashboard
"""

from datetime import date

from ..registry import (
    EndpointContract,
    ParamSchema,
    ServiceBoundarySchema,
    ResponseSchema,
    CompatMap,
    FieldSpec,
    register_contract,
    SchemaMode,
)


# =============================================================================
# PARAM SCHEMA - What frontend sends
# =============================================================================

DASHBOARD_PARAM_SCHEMA = ParamSchema(
    fields={
        # Date filters
        "date_from": FieldSpec(
            name="date_from",
            type=date,
            nullable=True,
            description="Start date (inclusive), YYYY-MM-DD"
        ),
        "date_to": FieldSpec(
            name="date_to",
            type=date,
            nullable=True,
            description="End date (inclusive), YYYY-MM-DD"
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
            description="Sale type filter (New Sale, Resale)"
        ),
        "tenure": FieldSpec(
            name="tenure",
            type=str,
            nullable=True,
            description="Tenure filter (Freehold, 99-year, 999-year)"
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
            description="Comma-separated panels: time_series, volume_by_location, price_histogram, bedroom_mix, sale_type_breakdown, summary"
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

        # Caching and schema
        "skip_cache": FieldSpec(
            name="skip_cache",
            type=bool,
            default=False,
            description="Bypass cache if true"
        ),
        "schema": FieldSpec(
            name="schema",
            type=str,
            default="v1",
            allowed_values=["v1", "v2"],
            description="Response schema version (v2 = camelCase only)"
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
        "schema": FieldSpec(name="schema", type=str, default="v1"),
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
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "elapsed_ms": FieldSpec(name="elapsed_ms", type=int, required=False),  # v1 compat
        "cacheHit": FieldSpec(name="cacheHit", type=bool, required=False),
        "cache_hit": FieldSpec(name="cache_hit", type=bool, required=False),
        "filtersApplied": FieldSpec(name="filtersApplied", type=dict, required=True),
        "filters_applied": FieldSpec(name="filters_applied", type=dict, required=False),
        "totalRecordsMatched": FieldSpec(name="totalRecordsMatched", type=int, required=False),
        "total_records_matched": FieldSpec(name="total_records_matched", type=int, required=False),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
        "data_masked": FieldSpec(name="data_masked", type=bool, required=False),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,  # Dashboard data is an object with panel keys
)


# =============================================================================
# BACKWARDS COMPATIBILITY
# =============================================================================

DASHBOARD_COMPAT_MAP = CompatMap(
    params={
        "saleType": "sale_type",
    },
    response={
        "elapsed_ms": "elapsedMs",
        "cache_hit": "cacheHit",
        "filters_applied": "filtersApplied",
        "total_records_matched": "totalRecordsMatched",
    }
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
    compat_map=DASHBOARD_COMPAT_MAP,
    serializer=None,  # Uses existing serialize_dashboard_response in route
    mode=SchemaMode.WARN,  # Start in warn mode
)

# Register on import
register_contract(DASHBOARD_CONTRACT)
