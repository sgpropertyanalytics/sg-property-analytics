"""
Pydantic models for /auth endpoint params.

Authentication and user management endpoints.

Endpoints:
- POST /auth/register - User registration
- POST /auth/login - User login
- GET /auth/me - Get current user (no params)
- POST /auth/firebase-sync - Sync Firebase OAuth user
- GET /auth/subscription - Get subscription status (no params)
- DELETE /auth/delete-account - Delete user account (no params)
"""

from typing import Optional

from pydantic import Field

from api.contracts.contract_schema import BaseParamsModel


class RegisterParams(BaseParamsModel):
    """Pydantic model for /auth/register endpoint params."""
    email: str = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (min 8 characters)")


class LoginParams(BaseParamsModel):
    """Pydantic model for /auth/login endpoint params."""
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class MeParams(BaseParamsModel):
    """Pydantic model for /auth/me endpoint params (no params, uses Authorization header)."""
    pass


class FirebaseSyncParams(BaseParamsModel):
    """Pydantic model for /auth/firebase-sync endpoint params."""
    idToken: str = Field(..., alias="idToken", description="Firebase ID token from OAuth sign-in")
    email: Optional[str] = Field(None, description="User email (fallback if not in token)")
    displayName: Optional[str] = Field(None, alias="displayName", description="User display name from OAuth")
    photoURL: Optional[str] = Field(None, alias="photoURL", description="User avatar URL from OAuth")


class SubscriptionParams(BaseParamsModel):
    """Pydantic model for /auth/subscription endpoint params (no params, uses Authorization header)."""
    pass


class DeleteAccountParams(BaseParamsModel):
    """Pydantic model for /auth/delete-account endpoint params (no params, uses Authorization header)."""
    pass
