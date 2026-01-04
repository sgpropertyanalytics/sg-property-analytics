"""
Contract schema for /aggregate endpoint.

This is the core aggregation endpoint used by all charts for Power BI-style
dynamic filtering.

Endpoint: GET /api/aggregate
"""

from ..registry import (
    EndpointContract,
    ResponseSchema,
    FieldSpec,
    register_contract,
    make_meta_fields,
    make_required_meta,
)
from ..pydantic_models.aggregate import AggregateParams


# =============================================================================
# RESPONSE SCHEMA - What endpoint returns
# =============================================================================

AGGREGATE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # Period fields (depends on group_by)
        "period": FieldSpec(name="period", type=str, required=False),
        "periodGrain": FieldSpec(name="periodGrain", type=str, required=False),
        "month": FieldSpec(name="month", type=str, required=False),
        "quarter": FieldSpec(name="quarter", type=str, required=False),
        "year": FieldSpec(name="year", type=int, required=False),

        # Dimension fields
        "district": FieldSpec(name="district", type=str, required=False),
        "bedroom": FieldSpec(name="bedroom", type=int, required=False),
        "bedroomCount": FieldSpec(name="bedroomCount", type=int, required=False),
        "saleType": FieldSpec(name="saleType", type=str, required=False),
        "project": FieldSpec(name="project", type=str, required=False),
        "region": FieldSpec(name="region", type=str, required=False),
        "floorLevel": FieldSpec(name="floorLevel", type=str, required=False),

        # Metric fields (always includes count)
        "count": FieldSpec(name="count", type=int, required=True),
        "medianPsf": FieldSpec(name="medianPsf", type=float, nullable=True),
        "avgPsf": FieldSpec(name="avgPsf", type=float, nullable=True),
        "totalValue": FieldSpec(name="totalValue", type=int, nullable=True),
        "avgPrice": FieldSpec(name="avgPrice", type=float, nullable=True),
        "medianPrice": FieldSpec(name="medianPrice", type=float, nullable=True),

        # Project inventory fields (when group_by=project and metrics includes total_units)
        "totalUnits": FieldSpec(name="totalUnits", type=int, nullable=True),
        "totalUnitsSource": FieldSpec(name="totalUnitsSource", type=str, nullable=True),
        "totalUnitsConfidence": FieldSpec(name="totalUnitsConfidence", type=str, nullable=True),
        # TOP year for age calculation (when group_by=project and metrics includes total_units)
        "topYear": FieldSpec(name="topYear", type=int, nullable=True),
        # Lease info and age band (when group_by=project)
        "leaseStartYear": FieldSpec(name="leaseStartYear", type=int, nullable=True),
        "propertyAgeYears": FieldSpec(name="propertyAgeYears", type=int, nullable=True),
        "ageBand": FieldSpec(name="ageBand", type=str, nullable=True),
    },
    # Use make_meta_fields() for base meta + endpoint-specific fields
    meta_fields=make_meta_fields(
        FieldSpec(name="cacheHit", type=bool, required=False),
        FieldSpec(name="filtersApplied", type=dict, required=True),
        FieldSpec(name="totalRecords", type=int, required=False),
        FieldSpec(name="schemaVersion", type=str, required=False),
        FieldSpec(name="warnings", type=list, required=False, description="Diagnostic warnings about normalization or data quality"),
    ),
    required_meta=make_required_meta("filtersApplied"),
    data_is_list=True,
)


# =============================================================================
# REGISTER CONTRACT
# =============================================================================

AGGREGATE_CONTRACT = EndpointContract(
    endpoint="aggregate",
    version="v3",
    response_schema=AGGREGATE_RESPONSE_SCHEMA,
    pydantic_model=AggregateParams,
    serializer=None,  # Uses existing serialize_aggregate_response in route
)

# Register on import
register_contract(AGGREGATE_CONTRACT)
