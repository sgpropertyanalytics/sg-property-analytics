"""
Project Location Model - Unique projects with coordinates and school proximity

Derived from transactions table. Stores unique project locations with:
- Coordinates (from OneMap geocoding)
- School proximity flag (computed from popular_schools)
- Filter dimensions aligned with Transaction table for Power BI cross-filtering

IMPORTANT: Field names MUST match Transaction table for cross-filtering:
- project_name: Primary key, matches Transaction.project_name
- district: Matches Transaction.district
- market_segment: Derived from district (stored for convenience)
"""
from models.database import db
from datetime import datetime
from typing import Dict, Any, Optional


class ProjectLocation(db.Model):
    __tablename__ = 'project_locations'

    id = db.Column(db.Integer, primary_key=True)

    # ==========================================================================
    # PROJECT IDENTIFICATION (aligned with Transaction)
    # ==========================================================================
    project_name = db.Column(db.String(255), unique=True, nullable=False, index=True)

    # ==========================================================================
    # LOCATION DIMENSIONS (aligned with Transaction for cross-filtering)
    # ==========================================================================
    district = db.Column(db.String(10), index=True)  # D01-D28, matches Transaction.district
    market_segment = db.Column(db.String(10), index=True)  # CCR/RCR/OCR, derived from district
    planning_area = db.Column(db.String(100), index=True)  # From geocoding, if available

    # ==========================================================================
    # COORDINATES (from OneMap geocoding)
    # ==========================================================================
    latitude = db.Column(db.Numeric(10, 7))
    longitude = db.Column(db.Numeric(10, 7))

    # ==========================================================================
    # SCHOOL PROXIMITY FLAG (pre-computed)
    # ==========================================================================
    has_popular_school_1km = db.Column(db.Boolean, default=None, index=True)

    # ==========================================================================
    # GEOCODING STATUS
    # ==========================================================================
    geocode_status = db.Column(db.String(20), default='pending', index=True)
    # Values: 'pending', 'success', 'failed', 'manual_review'
    geocode_source = db.Column(db.String(50))  # 'onemap_project', 'onemap_address', 'manual'
    geocode_error = db.Column(db.Text)  # Error message if failed

    # ==========================================================================
    # ADDITIONAL ADDRESS INFO (from geocoding)
    # ==========================================================================
    address = db.Column(db.Text)  # Full address from geocoding
    postal_code = db.Column(db.String(10))

    # ==========================================================================
    # TRANSACTION STATS (for reference, derived from transactions)
    # ==========================================================================
    transaction_count = db.Column(db.Integer)  # Number of transactions for this project
    first_transaction_date = db.Column(db.Date)
    last_transaction_date = db.Column(db.Date)

    # ==========================================================================
    # TIMESTAMPS
    # ==========================================================================
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_geocoded_at = db.Column(db.DateTime)

    # ==========================================================================
    # INDEXES for common query patterns
    # ==========================================================================
    __table_args__ = (
        db.Index('ix_project_locations_segment_school', 'market_segment', 'has_popular_school_1km'),
        db.Index('ix_project_locations_district_school', 'district', 'has_popular_school_1km'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'project_name': self.project_name,
            'district': self.district,
            'market_segment': self.market_segment,
            'planning_area': self.planning_area,
            'latitude': float(self.latitude) if self.latitude else None,
            'longitude': float(self.longitude) if self.longitude else None,
            'has_popular_school_1km': self.has_popular_school_1km,
            'geocode_status': self.geocode_status,
            'geocode_source': self.geocode_source,
            'geocode_error': self.geocode_error,
            'address': self.address,
            'postal_code': self.postal_code,
            'transaction_count': self.transaction_count,
            'first_transaction_date': self.first_transaction_date.isoformat() if self.first_transaction_date else None,
            'last_transaction_date': self.last_transaction_date.isoformat() if self.last_transaction_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'last_geocoded_at': self.last_geocoded_at.isoformat() if self.last_geocoded_at else None,
        }

    @staticmethod
    def get_market_segment(district: str) -> Optional[str]:
        """
        Map Singapore postal district to Market Segment.
        Consistent with data_processor._get_market_segment()
        """
        if not district:
            return None

        d = str(district).strip().upper()
        if not d.startswith("D"):
            d = f"D{d.zfill(2)}"

        # Core Central Region (CCR)
        ccr_districts = ["D01", "D02", "D06", "D07", "D09", "D10", "D11"]
        if d in ccr_districts:
            return "CCR"

        # Rest of Central Region (RCR)
        rcr_districts = ["D03", "D04", "D05", "D08", "D12", "D13", "D14", "D15", "D20"]
        if d in rcr_districts:
            return "RCR"

        # Outside Central Region (OCR)
        return "OCR"

    def __repr__(self):
        school_flag = "Yes" if self.has_popular_school_1km else "No"
        return f"<ProjectLocation {self.project_name} ({self.district}) School: {school_flag}>"
