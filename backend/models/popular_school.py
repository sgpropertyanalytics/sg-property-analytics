"""
Popular School Model - Top 35 primary schools reference data

Stores the Top 35 popular primary schools in Singapore with their coordinates.
This is reference data that should be manually uploaded once.

Fields:
- school_name: Primary key, unique school name
- postal_code: School postal code
- latitude/longitude: Coordinates for distance calculation
- is_gep: Whether school has Gifted Education Programme
- is_sap: Whether school is SAP (Special Assistance Plan) school
- school_family: School family/affiliation if any
"""
from models.database import db
from datetime import datetime
from typing import Dict, Any


class PopularSchool(db.Model):
    __tablename__ = 'popular_schools'

    id = db.Column(db.Integer, primary_key=True)

    # ==========================================================================
    # SCHOOL IDENTIFICATION
    # ==========================================================================
    school_name = db.Column(db.String(255), unique=True, nullable=False, index=True)
    postal_code = db.Column(db.String(10))

    # ==========================================================================
    # COORDINATES (for distance calculation)
    # ==========================================================================
    latitude = db.Column(db.Numeric(10, 7))
    longitude = db.Column(db.Numeric(10, 7))

    # ==========================================================================
    # OPTIONAL METADATA
    # ==========================================================================
    is_gep = db.Column(db.Boolean, default=False)  # Gifted Education Programme
    is_sap = db.Column(db.Boolean, default=False)  # Special Assistance Plan
    school_family = db.Column(db.String(100))  # e.g., "Methodist", "Catholic", etc.
    address = db.Column(db.Text)

    # ==========================================================================
    # DATA PROVENANCE
    # ==========================================================================
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'school_name': self.school_name,
            'postal_code': self.postal_code,
            'latitude': float(self.latitude) if self.latitude else None,
            'longitude': float(self.longitude) if self.longitude else None,
            'is_gep': self.is_gep,
            'is_sap': self.is_sap,
            'school_family': self.school_family,
            'address': self.address,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<PopularSchool {self.school_name}>"
