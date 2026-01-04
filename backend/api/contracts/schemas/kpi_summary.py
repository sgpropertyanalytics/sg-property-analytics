"""
Contract schema for /kpi-summary-v2 endpoint.

Returns all KPI metrics via the registry pattern.

Endpoint: GET /api/kpi-summary-v2
"""

from ..registry import (
    EndpointContract,
    ResponseSchema,
    FieldSpec,
    register_contract,
    make_meta_fields,
    make_required_meta,
)
from ..pydantic_models.kpi_summary import (
    KPISummaryParams,
    KPISingleParams,
    KPISummaryLegacyParams,
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
# REGISTER CONTRACTS
# =============================================================================

KPI_SUMMARY_CONTRACT = EndpointContract(
    endpoint="kpi-summary-v2",
    version="v3",
    response_schema=KPI_SUMMARY_RESPONSE_SCHEMA,
    pydantic_model=KPISummaryParams,
)

register_contract(KPI_SUMMARY_CONTRACT)


# KPI-SUMMARY-V2/<KPI_ID> - Single KPI endpoint
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


# KPI-SUMMARY (Legacy) endpoint
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
