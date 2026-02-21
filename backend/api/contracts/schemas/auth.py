"""
Contract schemas for /auth endpoints.

Endpoints:
- DELETE /auth/delete-account - Delete user account
"""

from ..registry import (
    EndpointContract,
    ResponseSchema,
    FieldSpec,
    register_contract,
    make_meta_fields,
    make_required_meta,
)

from ..pydantic_models.auth import (
    DeleteAccountParams,
)


# =============================================================================
# DELETE ACCOUNT ENDPOINT
# =============================================================================

DELETE_ACCOUNT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "message": FieldSpec(name="message", type=str, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

DELETE_ACCOUNT_CONTRACT = EndpointContract(
    endpoint="auth/delete-account",
    version="v3",
    pydantic_model=DeleteAccountParams,
    response_schema=DELETE_ACCOUNT_RESPONSE_SCHEMA,
)

register_contract(DELETE_ACCOUNT_CONTRACT)
