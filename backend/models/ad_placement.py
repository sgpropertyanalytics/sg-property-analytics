"""
Ad Placement Model - Tracks ad impressions and clicks
"""
from models.database import db
from datetime import datetime

class AdPlacement(db.Model):
    __tablename__ = 'ad_placements'
    
    id = db.Column(db.Integer, primary_key=True)
    ad_slot = db.Column(db.String(50), nullable=False, index=True)  # e.g., 'header', 'sidebar', 'footer'
    ad_type = db.Column(db.String(50), nullable=False)  # e.g., 'banner', 'sponsored', 'native'
    title = db.Column(db.String(255))
    content = db.Column(db.Text)  # HTML content or JSON
    image_url = db.Column(db.String(500))
    link_url = db.Column(db.String(500))
    is_active = db.Column(db.Boolean, default=True, index=True)
    priority = db.Column(db.Integer, default=0)  # Higher priority shown first
    impressions = db.Column(db.Integer, default=0)
    clicks = db.Column(db.Integer, default=0)
    start_date = db.Column(db.DateTime)
    end_date = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def record_impression(self):
        """Record an ad impression"""
        self.impressions += 1
        db.session.commit()
    
    def record_click(self):
        """Record an ad click"""
        self.clicks += 1
        db.session.commit()
    
    def is_valid(self):
        """Check if ad is currently valid (active and within date range)"""
        if not self.is_active:
            return False
        now = datetime.utcnow()
        if self.start_date and now < self.start_date:
            return False
        if self.end_date and now > self.end_date:
            return False
        return True
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'ad_slot': self.ad_slot,
            'ad_type': self.ad_type,
            'title': self.title,
            'content': self.content,
            'image_url': self.image_url,
            'link_url': self.link_url,
            'is_active': self.is_active,
            'priority': self.priority,
            'impressions': self.impressions,
            'clicks': self.clicks,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

