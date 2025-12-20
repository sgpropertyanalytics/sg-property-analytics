"""
PreComputedStats Model - Stores pre-aggregated analytics as JSON
"""
from models.database import db
from datetime import datetime
import json

class PreComputedStats(db.Model):
    __tablename__ = 'precomputed_stats'
    
    id = db.Column(db.Integer, primary_key=True)
    stat_key = db.Column(db.String(100), unique=True, nullable=False, index=True)
    stat_value = db.Column(db.Text, nullable=False)  # JSON stored as TEXT
    computed_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    row_count = db.Column(db.Integer)  # Number of transactions used in calculation
    
    @classmethod
    def get_stat(cls, key):
        """Get a pre-computed stat by key, returns None if not found"""
        record = cls.query.filter_by(stat_key=key).first()
        if not record:
            return None
        
        # Parse JSON from TEXT column
        value = record.stat_value
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return value
    
    @classmethod
    def set_stat(cls, key, value, row_count=None):
        """Set or update a pre-computed stat"""
        record = cls.query.filter_by(stat_key=key).first()
        
        # Convert value to JSON string for storage
        json_value = json.dumps(value) if not isinstance(value, str) else value
        
        if record:
            record.stat_value = json_value
            record.computed_at = datetime.utcnow()
            record.row_count = row_count
        else:
            record = cls(stat_key=key, stat_value=json_value, row_count=row_count)
            db.session.add(record)
        
        db.session.commit()
        return record
    
    @classmethod
    def delete_stat(cls, key):
        """Delete a pre-computed stat"""
        record = cls.query.filter_by(stat_key=key).first()
        if record:
            db.session.delete(record)
            db.session.commit()
            return True
        return False

