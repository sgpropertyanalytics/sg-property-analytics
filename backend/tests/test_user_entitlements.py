from datetime import datetime, timedelta

from models.user import User


def test_admin_override_entitlement_grants_access():
    now = datetime.utcnow()
    user = User(
        plan_tier="premium",
        access_override=True,
        entitlement_source="admin",
        override_until=None,
    )

    entitlement = user.entitlement_info(now=now)

    assert user.normalized_tier() == "premium"
    assert entitlement["has_access"] is True
    assert entitlement["entitlement_source"] == "admin"
    assert entitlement["access_expires_at"] is None


def test_stripe_premium_entitlement_grants_access():
    now = datetime.utcnow()
    future_end = now + timedelta(days=7)
    user = User(
        plan_tier="premium",
        subscription_status="active",
        subscription_ends_at=future_end,
    )

    entitlement = user.entitlement_info(now=now)

    assert user.normalized_tier() == "premium"
    assert entitlement["has_access"] is True
    assert entitlement["entitlement_source"] == "stripe"
    assert entitlement["access_expires_at"] == future_end


def test_free_user_has_no_access():
    user = User(plan_tier="free")

    entitlement = user.entitlement_info()

    assert user.normalized_tier() == "free"
    assert entitlement["has_access"] is False
    assert entitlement["entitlement_source"] is None
    assert entitlement["access_expires_at"] is None


def test_tier_normalization_never_returns_enterprise():
    user = User(plan_tier="enterprise")

    assert user.normalized_tier() in {"free", "premium"}
    assert user.to_dict()["tier"] in {"free", "premium"}
