"""
Contract schemas for /auth endpoints.

Authentication and user management endpoints.

Endpoints:
- POST /auth/register - User registration
- POST /auth/login - User login
- GET /auth/me - Get current user
- POST /auth/firebase-sync - Sync Firebase OAuth user
- GET /auth/subscription - Get subscription status
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

# Import Pydantic models
from ..pydantic_models.auth import (
    RegisterParams,
    LoginParams,
    MeParams,
    FirebaseSyncParams,
    SubscriptionParams,
    DeleteAccountParams,
)


# =============================================================================
# REGISTER ENDPOINT
# =============================================================================

REGISTER_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "message": FieldSpec(name="message", type=str, required=True),
        "user": FieldSpec(name="user", type=dict, required=True),
        "token": FieldSpec(name="token", type=str, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

REGISTER_CONTRACT = EndpointContract(
    endpoint="auth/register",
    version="v3",
    pydantic_model=RegisterParams,
    response_schema=REGISTER_RESPONSE_SCHEMA,
)

register_contract(REGISTER_CONTRACT)


# =============================================================================
# LOGIN ENDPOINT
# =============================================================================

LOGIN_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "message": FieldSpec(name="message", type=str, required=True),
        "user": FieldSpec(name="user", type=dict, required=True),
        "token": FieldSpec(name="token", type=str, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

LOGIN_CONTRACT = EndpointContract(
    endpoint="auth/login",
    version="v3",
    pydantic_model=LoginParams,
    response_schema=LOGIN_RESPONSE_SCHEMA,
)

register_contract(LOGIN_CONTRACT)


# =============================================================================
# GET CURRENT USER ENDPOINT
# =============================================================================

ME_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "user": FieldSpec(name="user", type=dict, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

ME_CONTRACT = EndpointContract(
    endpoint="auth/me",
    version="v3",
    pydantic_model=MeParams,
    response_schema=ME_RESPONSE_SCHEMA,
)

register_contract(ME_CONTRACT)


# =============================================================================
# FIREBASE SYNC ENDPOINT
# =============================================================================

FIREBASE_SYNC_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "message": FieldSpec(name="message", type=str, required=True),
        "token": FieldSpec(name="token", type=str, required=True),
        "user": FieldSpec(name="user", type=dict, required=True),
        "subscription": FieldSpec(name="subscription", type=dict, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

FIREBASE_SYNC_CONTRACT = EndpointContract(
    endpoint="auth/firebase-sync",
    version="v3",
    pydantic_model=FirebaseSyncParams,
    response_schema=FIREBASE_SYNC_RESPONSE_SCHEMA,
)

register_contract(FIREBASE_SYNC_CONTRACT)


# =============================================================================
# SUBSCRIPTION ENDPOINT
# =============================================================================

SUBSCRIPTION_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "tier": FieldSpec(name="tier", type=str, required=True),
        "has_access": FieldSpec(name="has_access", type=bool, required=True),
        "subscribed": FieldSpec(name="subscribed", type=bool, required=True),
        "entitlement_source": FieldSpec(name="entitlement_source", type=str, nullable=True),
        "access_expires_at": FieldSpec(name="access_expires_at", type=str, nullable=True),
        "ends_at": FieldSpec(name="ends_at", type=str, nullable=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,
)

SUBSCRIPTION_CONTRACT = EndpointContract(
    endpoint="auth/subscription",
    version="v3",
    pydantic_model=SubscriptionParams,
    response_schema=SUBSCRIPTION_RESPONSE_SCHEMA,
)

register_contract(SUBSCRIPTION_CONTRACT)


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
