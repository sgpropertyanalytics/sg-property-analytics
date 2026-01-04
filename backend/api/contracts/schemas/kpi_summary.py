"""
Contract schema for /kpi-summary-v2 endpoint.

Returns all KPI metrics via the registry pattern.

Endpoint: GET /api/kpi-summary-v2
"""

from datetime import date

# Import Pydantic models for parallel validation
try:
    from ..pydantic_models.kpi_summary import (
        KPISummaryParams,
        KPISingleParams,
        KPISummaryLegacyParams,
    )
except ImportError:
    KPISummaryParams = None
    KPISingleParams = None
    KPISummaryLegacyParams = None

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


# =============================================================================
# PARAM SCHEMA - What frontend sends
# =============================================================================

KPI_SUMMARY_PARAM_SCHEMA = ParamSchema(
    fields={
        # Filters
        "district": FieldSpec(
            name="district",
            type=str,
            nullable=True,
            description="Comma-separated district codes (D01, D02, or just 1, 2)"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            nullable=True,
            description="Comma-separated bedroom counts (2, 3, 4)"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter (CCR, RCR, OCR)"
        ),
        "max_date": FieldSpec(
            name="max_date",
            type=date,
            nullable=True,
            description="Reference date for KPI calculations (defaults to latest transaction date)"
        ),
    },
    aliases={
        # Accept camelCase from frontend
        "maxDate": "max_date",
    }
)


# =============================================================================
# SERVICE BOUNDARY SCHEMA - What service receives after normalization
# =============================================================================

KPI_SUMMARY_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "districts": FieldSpec(name="districts", type=str, nullable=True),  # Comma-separated
        "bedrooms": FieldSpec(name="bedrooms", type=str, nullable=True),  # Comma-separated
        "segment": FieldSpec(name="segment", type=str, nullable=True),
        "max_date": FieldSpec(name="max_date", type=date, nullable=True),
    }
)


# =============================================================================
# RESPONSE SCHEMA - What endpoint returns
# =============================================================================

# KPI item schema (nested)
KPI_ITEM_FIELDS = {
    "kpi_id": FieldSpec(name="kpi_id", type=str, required=True),
    "title": FieldSpec(name="title", type=str, required=True),
    "value": FieldSpec(name="value", type=float, nullable=True),  # Can be null if no data
    "formatted_value": FieldSpec(name="formatted_value", type=str, nullable=True),
    "subtitle": FieldSpec(name="subtitle", type=str, nullable=True),
    "trend": FieldSpec(name="trend", type=dict, nullable=True),  # {value, direction, label}
    "insight": FieldSpec(name="insight", type=str, nullable=True),
    "meta": FieldSpec(name="meta", type=dict, nullable=True),
}

KPI_SUMMARY_RESPONSE_SCHEMA = ResponseSchema(
    # Note: data_fields here describe items in the "kpis" array
    data_fields=KPI_ITEM_FIELDS,
    meta_fields=make_meta_fields(
        FieldSpec(name="filtersApplied", type=dict, required=True),
    ),
    required_meta=make_required_meta("filtersApplied"),
    data_is_list=True,
)


# =============================================================================
# CUSTOM RESPONSE VALIDATOR
# =============================================================================

def validate_kpi_response(response: dict) -> None:
    """
    Custom validation for KPI response.

    The response has structure:
    {
        "kpis": [...],
        "meta": {...}
    }

    Not:
    {
        "data": [...],
        "meta": {...}
    }
    """
    from ..validate import ContractViolation

    violations = []

    # Check kpis array exists
    if "kpis" not in response:
        violations.append({
            "path": "kpis",
            "error": "missing_field",
            "message": "Response must have 'kpis' array"
        })
    elif not isinstance(response["kpis"], list):
        violations.append({
            "path": "kpis",
            "error": "type_mismatch",
            "expected": "list",
            "received": type(response["kpis"]).__name__
        })
    elif response["kpis"]:
        # Validate first KPI item
        kpi = response["kpis"][0]
        for field_name, spec in KPI_ITEM_FIELDS.items():
            if spec.required and field_name not in kpi:
                violations.append({
                    "path": f"kpis[].{field_name}",
                    "error": "missing_field",
                    "message": f"Required field '{field_name}' missing"
                })

    # Check meta exists
    if "meta" not in response:
        violations.append({
            "path": "meta",
            "error": "missing_field",
            "message": "Response must have 'meta' object"
        })

    if violations:
        raise ContractViolation(
            message=f"{len(violations)} KPI response schema violation(s)",
            details={"violations": violations}
        )


# =============================================================================
# REGISTER CONTRACT
# =============================================================================

KPI_SUMMARY_CONTRACT = EndpointContract(
    endpoint="kpi-summary-v2",
    version="v3",
    response_schema=KPI_SUMMARY_RESPONSE_SCHEMA,
    pydantic_model=KPISummaryParams,
)

# Register on import
register_contract(KPI_SUMMARY_CONTRACT)


# =============================================================================
# KPI-SUMMARY-V2/<KPI_ID> ENDPOINT - Single KPI
# =============================================================================

KPI_SINGLE_PARAM_SCHEMA = ParamSchema(
    fields={
        "district": FieldSpec(
            name="district",
            type=str,
            nullable=True,
            description="Comma-separated district codes"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            nullable=True,
            description="Comma-separated bedroom counts"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter"
        ),
    },
    aliases={}
)

KPI_SINGLE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "kpi_id": FieldSpec(name="kpi_id", type=str, required=True),
        "districts": FieldSpec(name="districts", type=str, nullable=True),
        "bedrooms": FieldSpec(name="bedrooms", type=str, nullable=True),
        "segment": FieldSpec(name="segment", type=str, nullable=True),
    }
)

KPI_SINGLE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

KPI_SINGLE_CONTRACT = EndpointContract(
    endpoint="kpi-summary-v2/single",
    version="v3",
    response_schema=KPI_SINGLE_RESPONSE_SCHEMA,
    pydantic_model=KPISingleParams,
)

register_contract(KPI_SINGLE_CONTRACT)


# =============================================================================
# KPI-SUMMARY (Legacy) ENDPOINT
# =============================================================================

KPI_SUMMARY_LEGACY_PARAM_SCHEMA = ParamSchema(
    fields={
        "district": FieldSpec(
            name="district",
            type=str,
            nullable=True,
            description="Comma-separated district codes"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=str,
            nullable=True,
            description="Comma-separated bedroom counts"
        ),
        "segment": FieldSpec(
            name="segment",
            type=str,
            nullable=True,
            allowed_values=["CCR", "RCR", "OCR"],
            description="Market segment filter"
        ),
    },
    aliases={}
)

KPI_SUMMARY_LEGACY_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "districts": FieldSpec(name="districts", type=list, nullable=True),
        "bedrooms": FieldSpec(name="bedrooms", type=list, nullable=True),
        "segment": FieldSpec(name="segment", type=str, nullable=True),
    }
)

KPI_SUMMARY_LEGACY_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

KPI_SUMMARY_LEGACY_CONTRACT = EndpointContract(
    endpoint="kpi-summary",
    version="v3",
    response_schema=KPI_SUMMARY_LEGACY_RESPONSE_SCHEMA,
    pydantic_model=KPISummaryLegacyParams,
)

register_contract(KPI_SUMMARY_LEGACY_CONTRACT)
