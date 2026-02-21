"""
User model.

All authenticated users have full access. DB columns retain legacy names
for migration compatibility (migration 024 sync triggers reference them).
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

    # Legacy DB columns kept for migration compatibility.
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

    def access_info(self):
        return {
            'has_access': True,
            'access_source': 'authenticated_user',
            'access_expires_at': None,
        }

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'display_name': self.display_name,
            'avatar_url': self.avatar_url,
            'accessLevel': self.access_level,
            'has_access': True,
            'accessSource': 'authenticated_user',
            'access_expires_at': None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
