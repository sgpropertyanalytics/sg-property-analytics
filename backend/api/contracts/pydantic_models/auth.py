"""
Pydantic models for /auth endpoint params.

Endpoints:
- DELETE /auth/delete-account - Delete user account (no params, uses Authorization header)
"""

from api.contracts.contract_schema import BaseParamsModel


class DeleteAccountParams(BaseParamsModel):
    """Pydantic model for /auth/delete-account endpoint params (no params, uses Authorization header)."""
    pass
