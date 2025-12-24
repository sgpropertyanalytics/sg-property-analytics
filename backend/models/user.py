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
1. tier == 'premium' AND
2. subscription_status in ('active', 'trialing', 'past_due') AND
3. subscription_ends_at > now (or None for trialing)
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
    tier = db.Column(db.String(20), default='free')  # 'free', 'premium', 'enterprise'
    stripe_customer_id = db.Column(db.String(255))
    subscription_status = db.Column(db.String(50), default=None)  # Stripe subscription.status
    subscription_ends_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    display_name = db.Column(db.String(255), nullable=True)
    avatar_url = db.Column(db.String(512), nullable=True)

    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Check if provided password matches hash"""
        return check_password_hash(self.password_hash, password)

    def is_subscribed(self):
        """
        Check if user has active subscription with premium access.

        Access is granted when ALL conditions are met:
        1. tier is 'premium' (or 'enterprise')
        2. subscription_status is active/trialing/past_due
        3. subscription_ends_at is in the future (or None for perpetual/trialing)

        Special cases:
        - 'canceled' status: access until subscription_ends_at
        - 'past_due' status: grace period access until subscription_ends_at
        - 'trialing' status: always has access (subscription_ends_at may be None)
        """
        # Free tier never has premium access
        if self.tier == 'free':
            return False

        # Enterprise tier always has access (manual management)
        if self.tier == 'enterprise':
            return True

        # Premium tier: check subscription status and expiry
        if self.tier == 'premium':
            # If no status set (legacy), check expiry only
            if not self.subscription_status:
                if self.subscription_ends_at is None:
                    return True  # No expiry set (legacy premium)
                return self.subscription_ends_at > datetime.utcnow()

            # Trialing: always has access during trial
            if self.subscription_status == 'trialing':
                return True

            # Active subscription statuses
            if self.subscription_status in ACTIVE_STATUSES:
                if self.subscription_ends_at is None:
                    return True  # No expiry set
                return self.subscription_ends_at > datetime.utcnow()

            # Grace period statuses (canceled, past_due after grace)
            if self.subscription_status in GRACE_PERIOD_STATUSES:
                if self.subscription_ends_at is None:
                    return False  # No grace period defined
                return self.subscription_ends_at > datetime.utcnow()

            # All other statuses (unpaid, incomplete, etc.) = no access
            return False

        # Unknown tier = no access
        return False

    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'email': self.email,
            'display_name': self.display_name,
            'avatar_url': self.avatar_url,
            'tier': self.tier,
            'subscription_status': self.subscription_status,
            'subscribed': self.is_subscribed(),
            'subscription_ends_at': self.subscription_ends_at.isoformat() if self.subscription_ends_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

