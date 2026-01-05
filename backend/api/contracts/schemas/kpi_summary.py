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
    # data is an object with "kpis" key containing the array
    # data_fields describes the shape of data (not the items)
    data_fields={
        "kpis": FieldSpec(name="kpis", type=list, required=True),
    },
    meta_fields=make_meta_fields(
        FieldSpec(name="filtersApplied", type=dict, required=True),
    ),
    required_meta=make_required_meta("filtersApplied"),
    data_is_list=False,  # data is { kpis: [...] }, not a list itself
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


# =============================================================================
# KPI-SUMMARY-V2/<KPI_ID> - Single KPI endpoint
# =============================================================================
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
