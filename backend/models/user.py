"""
User Model - Authentication and subscription management
"""
from models.database import db
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    tier = db.Column(db.String(20), default='free')  # 'free', 'premium', 'enterprise'
    stripe_customer_id = db.Column(db.String(255))
    subscription_ends_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check if provided password matches hash"""
        return check_password_hash(self.password_hash, password)
    
    def is_subscribed(self):
        """Check if user has active subscription"""
        if self.tier == 'free':
            return False
        if self.subscription_ends_at and self.subscription_ends_at < datetime.utcnow():
            return False
        return True
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'email': self.email,
            'tier': self.tier,
            'subscribed': self.is_subscribed(),
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

