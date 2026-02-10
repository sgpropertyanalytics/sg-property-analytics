"""
User model with neutral access terminology.

Note: DB columns still include legacy names during the schema transition.
Runtime code should use neutral access names exposed by this model.
"""
from datetime import datetime

from models.database import db
from werkzeug.security import check_password_hash, generate_password_hash


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    firebase_uid = db.Column(db.String(128), unique=True, nullable=True, index=True)

    # Neutral DB column names for access state.
    access_level_storage = db.Column('access_tier', db.String(20), default='authenticated')
    billing_customer_ref_storage = db.Column('stripe_customer_id', db.String(255))
    access_status_storage = db.Column('access_status', db.String(50), default=None)
    access_expires_at_storage = db.Column('access_expires_at', db.DateTime)
    access_override_enabled_storage = db.Column('access_override', db.Boolean, default=False)
    access_override_until_storage = db.Column('override_until', db.DateTime)
    access_source_storage = db.Column('access_source', db.String(50))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    display_name = db.Column(db.String(255), nullable=True)
    avatar_url = db.Column(db.String(512), nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def access_level(self):
        return 'authenticated'

    @access_level.setter
    def access_level(self, _value):
        # Persist a stable value in legacy column during transition.
        self.access_level_storage = 'authenticated'

    @property
    def access_status(self):
        return self.access_status_storage

    @access_status.setter
    def access_status(self, value):
        self.access_status_storage = value

    @property
    def access_expires_at(self):
        return self.access_expires_at_storage

    @access_expires_at.setter
    def access_expires_at(self, value):
        self.access_expires_at_storage = value

    @property
    def billing_customer_ref(self):
        return self.billing_customer_ref_storage

    @billing_customer_ref.setter
    def billing_customer_ref(self, value):
        self.billing_customer_ref_storage = value

    @property
    def access_override_enabled(self):
        return self.access_override_enabled_storage

    @access_override_enabled.setter
    def access_override_enabled(self, value):
        self.access_override_enabled_storage = value

    @property
    def access_override_until(self):
        return self.access_override_until_storage

    @access_override_until.setter
    def access_override_until(self, value):
        self.access_override_until_storage = value

    @property
    def access_source(self):
        return self.access_source_storage

    @access_source.setter
    def access_source(self, value):
        self.access_source_storage = value

    def access_info(self, now=None):
        now = now or datetime.utcnow()

        source = self.access_source or 'authenticated_user'
        expires_at = None

        if self.access_override_enabled:
            source = self.access_source or 'admin_override'
            if self.access_override_until is None or now < self.access_override_until:
                expires_at = self.access_override_until

        return {
            'has_access': True,
            'access_source': source,
            'access_expires_at': expires_at,
        }

    def to_dict(self):
        access = self.access_info()
        return {
            'id': self.id,
            'email': self.email,
            'display_name': self.display_name,
            'avatar_url': self.avatar_url,
            'accessLevel': self.access_level,
            'has_access': access.get('has_access', True),
            'accessSource': access.get('access_source'),
            'access_expires_at': access.get('access_expires_at').isoformat()
            if access.get('access_expires_at')
            else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
