"""
Contract schema for /analytics/new-launch-absorption endpoint.

Provides launch-month absorption rates for new launch projects over time.

Endpoint: GET /api/analytics/new-launch-absorption
"""

from ..registry import (
    EndpointContract,
    ResponseSchema,
    FieldSpec,
    register_contract,
    make_meta_fields,
    make_required_meta,
)
from ..pydantic_models import NewLaunchAbsorptionParams


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
    pydantic_model=NewLaunchAbsorptionParams,
    response_schema=NEW_LAUNCH_ABSORPTION_RESPONSE_SCHEMA,
)

register_contract(NEW_LAUNCH_ABSORPTION_CONTRACT)
