"""
Contract schema for /analytics/new-launch-timeline endpoint.

Provides aggregated data about new launch projects over time.

Endpoint: GET /api/analytics/new-launch-timeline
"""

from ..registry import (
    EndpointContract,
    ResponseSchema,
    FieldSpec,
    register_contract,
    make_meta_fields,
    make_required_meta,
)
from ..pydantic_models import NewLaunchTimelineParams


# =============================================================================
# RESPONSE SCHEMA - What endpoint returns
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
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=True,
)


# =============================================================================
# REGISTER CONTRACT
# =============================================================================

NEW_LAUNCH_TIMELINE_CONTRACT = EndpointContract(
    endpoint="new-launch-timeline",
    version="v1",
    pydantic_model=NewLaunchTimelineParams,
    response_schema=NEW_LAUNCH_TIMELINE_RESPONSE_SCHEMA,
)

register_contract(NEW_LAUNCH_TIMELINE_CONTRACT)
