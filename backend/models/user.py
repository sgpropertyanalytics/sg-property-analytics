"""
User Model - Authentication and subscription management

Subscription Status Flow (from Stripe):
- 'trialing' → User is in trial period (still has access)
- 'active' → Payment successful, subscription active
- 'past_due' → Payment failed, but grace period active
- 'canceled' → Subscription cancelled (access until period end)
- 'unpaid' → Payment failed, no grace period left
- 'incomplete' → First payment failed
- 'incomplete_expired' → First payment never succeeded

For access control, we grant premium access when:
1. plan_tier == 'premium' AND
2. subscription_status in ('active', 'trialing', 'past_due') AND
3. subscription_ends_at > now (or None for trialing)

Manual access is handled via access_override/override_until fields.
"""
from models.database import db
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash


# Subscription statuses that grant premium access
ACTIVE_STATUSES = {'active', 'trialing', 'past_due'}

# Grace period: users with canceled/past_due can access until subscription_ends_at
GRACE_PERIOD_STATUSES = {'canceled', 'past_due'}


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    firebase_uid = db.Column(db.String(128), unique=True, nullable=True, index=True)
    plan_tier = db.Column("tier", db.String(20), default='free')  # 'free', 'premium'
    stripe_customer_id = db.Column(db.String(255))
    subscription_status = db.Column(db.String(50), default=None)  # Stripe subscription.status
    subscription_ends_at = db.Column(db.DateTime)
    access_override = db.Column(db.Boolean, default=False)
    override_until = db.Column(db.DateTime)
    entitlement_source = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    display_name = db.Column(db.String(255), nullable=True)
    avatar_url = db.Column(db.String(512), nullable=True)

    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Check if provided password matches hash"""
        return check_password_hash(self.password_hash, password)

    def normalized_tier(self):
        """Return the canonical plan tier (free|premium)."""
        if self.plan_tier == 'premium':
            return 'premium'
        if self.plan_tier not in (None, 'free'):
            print(f"[Entitlements] Unknown plan_tier '{self.plan_tier}' for user {self.id}")
        return 'free'

    def _has_active_override(self, now=None):
        """Check if manual override grants access."""
        if not self.access_override:
            return False
        now = now or datetime.utcnow()
        if self.override_until is None:
            return True
        return now < self.override_until

    def _has_active_stripe_access(self, now=None):
        """Check if Stripe subscription grants access."""
        if self.normalized_tier() != 'premium':
            return False

        now = now or datetime.utcnow()
        # If no status set (legacy), check expiry only
        if not self.subscription_status:
            if self.subscription_ends_at is None:
                return True  # No expiry set (legacy premium)
            return self.subscription_ends_at > now

        # Trialing: always has access during trial
        if self.subscription_status == 'trialing':
            return True

        # Active subscription statuses
        if self.subscription_status in ACTIVE_STATUSES:
            if self.subscription_ends_at is None:
                return True  # No expiry set
            return self.subscription_ends_at > now

        # Grace period statuses (canceled, past_due after grace)
        if self.subscription_status in GRACE_PERIOD_STATUSES:
            if self.subscription_ends_at is None:
                return False  # No grace period defined
            return self.subscription_ends_at > now

        # All other statuses (unpaid, incomplete, etc.) = no access
        return False

    def entitlement_info(self, now=None):
        """
        Return entitlement details:
        - has_access: boolean
        - entitlement_source: admin_override/stripe or None
        - access_expires_at: datetime or None
        """
        now = now or datetime.utcnow()

        if self._has_active_override(now=now):
            source = self.entitlement_source or "admin"
            if source in {"admin", "admin_override"}:
                print(f"[Entitlements] admin override access for user {self.id}")
            if source not in {"stripe", "admin", "admin_override", "promo", "beta"}:
                print(f"[Entitlements] Unknown entitlement_source '{source}' for user {self.id}")
            return {
                "has_access": True,
                "entitlement_source": source,
                "access_expires_at": self.override_until,
            }

        if self._has_active_stripe_access(now=now):
            source = "stripe"
            return {
                "has_access": True,
                "entitlement_source": source,
                "access_expires_at": self.subscription_ends_at,
            }

        return {
            "has_access": False,
            "entitlement_source": None,
            "access_expires_at": None,
        }

    def is_subscribed(self):
        """
        Backwards-compatible helper for premium access checks.
        """
        return self.entitlement_info().get("has_access", False)

    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        entitlement = self.entitlement_info()
        return {
            'id': self.id,
            'email': self.email,
            'display_name': self.display_name,
            'avatar_url': self.avatar_url,
            'tier': self.normalized_tier(),
            'subscription_status': self.subscription_status,
            'subscribed': entitlement.get("has_access", False),
            'has_access': entitlement.get("has_access", False),
            'entitlement_source': entitlement.get("entitlement_source"),
            'access_expires_at': entitlement.get("access_expires_at").isoformat()
            if entitlement.get("access_expires_at")
            else None,
            'subscription_ends_at': self.subscription_ends_at.isoformat() if self.subscription_ends_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
