"""
Contract schema for /kpi-summary-v2 endpoint.

Returns all KPI metrics via the registry pattern.

Endpoint: GET /api/kpi-summary-v2
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
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "elapsed_ms": FieldSpec(name="elapsed_ms", type=float, required=False),  # v1 compat
        "filtersApplied": FieldSpec(name="filtersApplied", type=dict, required=True),
        "filters_applied": FieldSpec(name="filters_applied", type=dict, required=False),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=True,
)


# =============================================================================
# BACKWARDS COMPATIBILITY
# =============================================================================

KPI_SUMMARY_COMPAT_MAP = CompatMap(
    params={},
    response={
        "elapsed_ms": "elapsedMs",
        "filters_applied": "filtersApplied",
    }
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
    param_schema=KPI_SUMMARY_PARAM_SCHEMA,
    service_schema=KPI_SUMMARY_SERVICE_SCHEMA,
    response_schema=KPI_SUMMARY_RESPONSE_SCHEMA,
    compat_map=KPI_SUMMARY_COMPAT_MAP,
    serializer=None,
)

# Register on import
register_contract(KPI_SUMMARY_CONTRACT)
