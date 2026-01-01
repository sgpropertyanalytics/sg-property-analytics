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
    ParamSchema,
    ServiceBoundarySchema,
    ResponseSchema,
    FieldSpec,
    register_contract,
)


# =============================================================================
# REGISTER ENDPOINT
# =============================================================================

REGISTER_PARAM_SCHEMA = ParamSchema(
    fields={
        "email": FieldSpec(
            name="email",
            type=str,
            required=True,
            description="User email address"
        ),
        "password": FieldSpec(
            name="password",
            type=str,
            required=True,
            description="User password (min 8 characters)"
        ),
    },
    aliases={}
)

REGISTER_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "email": FieldSpec(name="email", type=str, required=True),
        "password": FieldSpec(name="password", type=str, required=True),
    }
)

REGISTER_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "message": FieldSpec(name="message", type=str, required=True),
        "user": FieldSpec(name="user", type=dict, required=True),
        "token": FieldSpec(name="token", type=str, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

REGISTER_CONTRACT = EndpointContract(
    endpoint="auth/register",
    version="v3",
    param_schema=REGISTER_PARAM_SCHEMA,
    service_schema=REGISTER_SERVICE_SCHEMA,
    response_schema=REGISTER_RESPONSE_SCHEMA,
)

register_contract(REGISTER_CONTRACT)


# =============================================================================
# LOGIN ENDPOINT
# =============================================================================

LOGIN_PARAM_SCHEMA = ParamSchema(
    fields={
        "email": FieldSpec(
            name="email",
            type=str,
            required=True,
            description="User email address"
        ),
        "password": FieldSpec(
            name="password",
            type=str,
            required=True,
            description="User password"
        ),
    },
    aliases={}
)

LOGIN_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "email": FieldSpec(name="email", type=str, required=True),
        "password": FieldSpec(name="password", type=str, required=True),
    }
)

LOGIN_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "message": FieldSpec(name="message", type=str, required=True),
        "user": FieldSpec(name="user", type=dict, required=True),
        "token": FieldSpec(name="token", type=str, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

LOGIN_CONTRACT = EndpointContract(
    endpoint="auth/login",
    version="v3",
    param_schema=LOGIN_PARAM_SCHEMA,
    service_schema=LOGIN_SERVICE_SCHEMA,
    response_schema=LOGIN_RESPONSE_SCHEMA,
)

register_contract(LOGIN_CONTRACT)


# =============================================================================
# GET CURRENT USER ENDPOINT
# =============================================================================

ME_PARAM_SCHEMA = ParamSchema(
    fields={},  # No query params, uses Authorization header
    aliases={}
)

ME_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

ME_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "user": FieldSpec(name="user", type=dict, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

ME_CONTRACT = EndpointContract(
    endpoint="auth/me",
    version="v3",
    param_schema=ME_PARAM_SCHEMA,
    service_schema=ME_SERVICE_SCHEMA,
    response_schema=ME_RESPONSE_SCHEMA,
)

register_contract(ME_CONTRACT)


# =============================================================================
# FIREBASE SYNC ENDPOINT
# =============================================================================

FIREBASE_SYNC_PARAM_SCHEMA = ParamSchema(
    fields={
        "idToken": FieldSpec(
            name="idToken",
            type=str,
            required=True,
            description="Firebase ID token from OAuth sign-in"
        ),
        "email": FieldSpec(
            name="email",
            type=str,
            nullable=True,
            description="User email (fallback if not in token)"
        ),
        "displayName": FieldSpec(
            name="displayName",
            type=str,
            nullable=True,
            description="User display name from OAuth"
        ),
        "photoURL": FieldSpec(
            name="photoURL",
            type=str,
            nullable=True,
            description="User avatar URL from OAuth"
        ),
    },
    aliases={}
)

FIREBASE_SYNC_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={
        "idToken": FieldSpec(name="idToken", type=str, required=True),
        "email": FieldSpec(name="email", type=str, nullable=True),
        "displayName": FieldSpec(name="displayName", type=str, nullable=True),
        "photoURL": FieldSpec(name="photoURL", type=str, nullable=True),
    }
)

FIREBASE_SYNC_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "message": FieldSpec(name="message", type=str, required=True),
        "token": FieldSpec(name="token", type=str, required=True),
        "user": FieldSpec(name="user", type=dict, required=True),
        "subscription": FieldSpec(name="subscription", type=dict, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

FIREBASE_SYNC_CONTRACT = EndpointContract(
    endpoint="auth/firebase-sync",
    version="v3",
    param_schema=FIREBASE_SYNC_PARAM_SCHEMA,
    service_schema=FIREBASE_SYNC_SERVICE_SCHEMA,
    response_schema=FIREBASE_SYNC_RESPONSE_SCHEMA,
)

register_contract(FIREBASE_SYNC_CONTRACT)


# =============================================================================
# SUBSCRIPTION ENDPOINT
# =============================================================================

SUBSCRIPTION_PARAM_SCHEMA = ParamSchema(
    fields={},  # No query params, uses Authorization header
    aliases={}
)

SUBSCRIPTION_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

SUBSCRIPTION_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "tier": FieldSpec(name="tier", type=str, required=True),
        "has_access": FieldSpec(name="has_access", type=bool, required=True),
        "subscribed": FieldSpec(name="subscribed", type=bool, required=True),
        "entitlement_source": FieldSpec(name="entitlement_source", type=str, nullable=True),
        "access_expires_at": FieldSpec(name="access_expires_at", type=str, nullable=True),
        "ends_at": FieldSpec(name="ends_at", type=str, nullable=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

SUBSCRIPTION_CONTRACT = EndpointContract(
    endpoint="auth/subscription",
    version="v3",
    param_schema=SUBSCRIPTION_PARAM_SCHEMA,
    service_schema=SUBSCRIPTION_SERVICE_SCHEMA,
    response_schema=SUBSCRIPTION_RESPONSE_SCHEMA,
)

register_contract(SUBSCRIPTION_CONTRACT)


# =============================================================================
# DELETE ACCOUNT ENDPOINT
# =============================================================================

DELETE_ACCOUNT_PARAM_SCHEMA = ParamSchema(
    fields={},  # No params, uses Authorization header
    aliases={}
)

DELETE_ACCOUNT_SERVICE_SCHEMA = ServiceBoundarySchema(
    fields={}
)

DELETE_ACCOUNT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "message": FieldSpec(name="message", type=str, required=True),
    },
    meta_fields={
        "requestId": FieldSpec(name="requestId", type=str, required=True),
        "elapsedMs": FieldSpec(name="elapsedMs", type=float, required=True),
        "apiVersion": FieldSpec(name="apiVersion", type=str, required=True),
    },
    required_meta=["requestId", "elapsedMs", "apiVersion"],
    data_is_list=False,
)

DELETE_ACCOUNT_CONTRACT = EndpointContract(
    endpoint="auth/delete-account",
    version="v3",
    param_schema=DELETE_ACCOUNT_PARAM_SCHEMA,
    service_schema=DELETE_ACCOUNT_SERVICE_SCHEMA,
    response_schema=DELETE_ACCOUNT_RESPONSE_SCHEMA,
)

register_contract(DELETE_ACCOUNT_CONTRACT)
