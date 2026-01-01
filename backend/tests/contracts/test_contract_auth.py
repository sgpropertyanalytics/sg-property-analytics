"""
Contract tests for /auth endpoints.

Tests:
- Contract registration
- Param schema validation
- Response schema requirements
"""

import pytest


class TestRegisterContract:
    """Tests for auth/register contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "auth/register" in contract_registry
        contract = contract_registry["auth/register"]
        assert contract.version == "v3"
        assert contract.endpoint == "auth/register"

    def test_param_schema_has_required_fields(self, contract_registry):
        """ParamSchema should define required fields."""
        contract = contract_registry["auth/register"]
        fields = contract.param_schema.fields

        assert "email" in fields
        assert "password" in fields
        assert fields["email"].required is True
        assert fields["password"].required is True

    def test_response_schema_has_required_meta(self, contract_registry):
        """ResponseSchema should require meta fields."""
        contract = contract_registry["auth/register"]
        required = contract.response_schema.required_meta

        assert "requestId" in required
        assert "elapsedMs" in required
        assert "apiVersion" in required


class TestLoginContract:
    """Tests for auth/login contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "auth/login" in contract_registry
        contract = contract_registry["auth/login"]
        assert contract.version == "v3"
        assert contract.endpoint == "auth/login"

    def test_param_schema_has_required_fields(self, contract_registry):
        """ParamSchema should define required fields."""
        contract = contract_registry["auth/login"]
        fields = contract.param_schema.fields

        assert "email" in fields
        assert "password" in fields

    def test_response_schema_has_user_and_token(self, contract_registry):
        """ResponseSchema should include user and token fields."""
        contract = contract_registry["auth/login"]
        data_fields = contract.response_schema.data_fields

        assert "user" in data_fields
        assert "token" in data_fields
        assert "message" in data_fields


class TestMeContract:
    """Tests for auth/me contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "auth/me" in contract_registry
        contract = contract_registry["auth/me"]
        assert contract.version == "v3"

    def test_no_required_params(self, contract_registry):
        """Endpoint uses Authorization header, no query params."""
        contract = contract_registry["auth/me"]
        fields = contract.param_schema.fields

        # Should have no required params (auth via header)
        assert len(fields) == 0

    def test_response_has_user(self, contract_registry):
        """ResponseSchema should include user field."""
        contract = contract_registry["auth/me"]
        data_fields = contract.response_schema.data_fields

        assert "user" in data_fields


class TestFirebaseSyncContract:
    """Tests for auth/firebase-sync contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "auth/firebase-sync" in contract_registry
        contract = contract_registry["auth/firebase-sync"]
        assert contract.version == "v3"

    def test_param_schema_has_idToken(self, contract_registry):
        """ParamSchema should require idToken."""
        contract = contract_registry["auth/firebase-sync"]
        fields = contract.param_schema.fields

        assert "idToken" in fields
        assert fields["idToken"].required is True

    def test_param_schema_has_optional_profile_fields(self, contract_registry):
        """ParamSchema should have optional profile fields."""
        contract = contract_registry["auth/firebase-sync"]
        fields = contract.param_schema.fields

        assert "displayName" in fields
        assert "photoURL" in fields
        assert fields["displayName"].nullable is True
        assert fields["photoURL"].nullable is True

    def test_response_has_subscription(self, contract_registry):
        """ResponseSchema should include subscription field."""
        contract = contract_registry["auth/firebase-sync"]
        data_fields = contract.response_schema.data_fields

        assert "subscription" in data_fields
        assert "token" in data_fields
        assert "user" in data_fields


class TestSubscriptionContract:
    """Tests for auth/subscription contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "auth/subscription" in contract_registry
        contract = contract_registry["auth/subscription"]
        assert contract.version == "v3"

    def test_response_has_subscription_fields(self, contract_registry):
        """ResponseSchema should include tier, has_access, subscribed, and expiry."""
        contract = contract_registry["auth/subscription"]
        data_fields = contract.response_schema.data_fields

        assert "tier" in data_fields
        assert "has_access" in data_fields
        assert "subscribed" in data_fields
        assert "entitlement_source" in data_fields
        assert "access_expires_at" in data_fields
        assert "ends_at" in data_fields


class TestDeleteAccountContract:
    """Tests for auth/delete-account contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "auth/delete-account" in contract_registry
        contract = contract_registry["auth/delete-account"]
        assert contract.version == "v3"

    def test_response_has_message(self, contract_registry):
        """ResponseSchema should include message field."""
        contract = contract_registry["auth/delete-account"]
        data_fields = contract.response_schema.data_fields

        assert "message" in data_fields
