from models.user import User


def test_schema_guard_missing_columns_returns_503(client, monkeypatch):
    def fake_guard():
        return {
            "missing": ["access_override", "override_until", "entitlement_source"],
            "error": None,
        }

    monkeypatch.setattr(
        "services.schema_guard.check_user_entitlement_columns",
        fake_guard,
    )

    response = client.get("/api/auth/subscription")

    assert response.status_code == 503
    payload = response.get_json()
    assert payload["error"] == "Database schema out of date. Run migration 015_add_user_entitlements."
    assert payload["missing"] == ["access_override", "override_until", "entitlement_source"]


def test_subscription_endpoint_success_includes_entitlements(client, monkeypatch):
    user = User(
        id=123,
        email="test@example.com",
        plan_tier="premium",
        subscription_status="active",
    )

    monkeypatch.setattr(
        "services.schema_guard.check_user_entitlement_columns",
        lambda: {"missing": [], "error": None},
    )
    monkeypatch.setattr(
        "utils.subscription.get_user_from_request",
        lambda: user,
    )

    response = client.get(
        "/api/auth/subscription",
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["tier"] == "premium"
    assert "has_access" in payload
    assert "entitlement_source" in payload
    assert "access_expires_at" in payload
