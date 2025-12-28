"""
Contract schemas for Deal Checker endpoints.

Deal Checker provides transaction comparison and percentile analysis.

Endpoints:
- GET /api/deal-checker/nearby-transactions
- GET /api/deal-checker/multi-scope
- GET /api/projects/names
"""

from ..registry import (
    EndpointContract,
    ParamSchema,
    ServiceBoundarySchema,
    ResponseSchema,
    FieldSpec,
    register_contract,
    SchemaMode,
)


# =============================================================================
# /deal-checker/nearby-transactions
# =============================================================================

NEARBY_TRANSACTIONS_PARAM_SCHEMA = ParamSchema(
    fields={
        "project_name": FieldSpec(
            name="project_name",
            type=str,
            required=True,
            description="Name of the project"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=int,
            required=True,
            description="Bedroom count (1-5, where 5 means 5+)"
        ),
        "price": FieldSpec(
            name="price",
            type=float,
            required=True,
            description="Buyer's price paid"
        ),
        "sqft": FieldSpec(
            name="sqft",
            type=float,
            description="Unit size in sqft"
        ),
        "radius_km": FieldSpec(
            name="radius_km",
            type=float,
            default=1.0,
            description="Search radius in km"
        ),
    },
    aliases={}
)

NEARBY_TRANSACTIONS_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
        "bedroom": FieldSpec(name="bedroom", type=int, required=True),
        "buyer_price": FieldSpec(name="buyer_price", type=float, required=True),
        "sqft": FieldSpec(name="sqft", type=float),
        "radius_km": FieldSpec(name="radius_km", type=float, default=1.0),
    }
)

NEARBY_TRANSACTIONS_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

NEARBY_TRANSACTIONS_CONTRACT = EndpointContract(
    endpoint="deal-checker/nearby-transactions",
    version="v3",
    param_schema=NEARBY_TRANSACTIONS_PARAM_SCHEMA,
    service_schema=NEARBY_TRANSACTIONS_SERVICE_SCHEMA,
    response_schema=NEARBY_TRANSACTIONS_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(NEARBY_TRANSACTIONS_CONTRACT)


# =============================================================================
# /deal-checker/multi-scope
# =============================================================================

MULTI_SCOPE_PARAM_SCHEMA = ParamSchema(
    fields={
        "project_name": FieldSpec(
            name="project_name",
            type=str,
            required=True,
            description="Name of the project"
        ),
        "bedroom": FieldSpec(
            name="bedroom",
            type=int,
            required=True,
            description="Bedroom count (1-5, where 5 means 5+)"
        ),
        "price": FieldSpec(
            name="price",
            type=float,
            required=True,
            description="Buyer's price paid"
        ),
        "sqft": FieldSpec(
            name="sqft",
            type=float,
            description="Unit size in sqft for ±15% range filtering"
        ),
    },
    aliases={}
)

MULTI_SCOPE_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "project_name": FieldSpec(name="project_name", type=str, required=True),
        "bedroom": FieldSpec(name="bedroom", type=int, required=True),
        "buyer_price": FieldSpec(name="buyer_price", type=float, required=True),
        "sqft": FieldSpec(name="sqft", type=float),
    }
)

MULTI_SCOPE_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

MULTI_SCOPE_CONTRACT = EndpointContract(
    endpoint="deal-checker/multi-scope",
    version="v3",
    param_schema=MULTI_SCOPE_PARAM_SCHEMA,
    service_schema=MULTI_SCOPE_SERVICE_SCHEMA,
    response_schema=MULTI_SCOPE_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(MULTI_SCOPE_CONTRACT)


# =============================================================================
# /projects/names
# =============================================================================

PROJECT_NAMES_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params
    aliases={}
)

PROJECT_NAMES_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

PROJECT_NAMES_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

PROJECT_NAMES_CONTRACT = EndpointContract(
    endpoint="deal-checker/project-names",
    version="v3",
    param_schema=PROJECT_NAMES_PARAM_SCHEMA,
    service_schema=PROJECT_NAMES_SERVICE_SCHEMA,
    response_schema=PROJECT_NAMES_RESPONSE_SCHEMA,
    mode=SchemaMode.WARN,
)

register_contract(PROJECT_NAMES_CONTRACT)
