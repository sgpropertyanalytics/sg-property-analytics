"""
New Launch Model - Upcoming Private Condo Launches

Data source: CSV upload (source-of-truth)

Field naming conventions follow existing models:
- project_name, district, tenure, property_type (from Transaction)
- market_segment, planning_area, needs_review (from GLSTender)
"""
from models.database import db
from datetime import datetime
from typing import Dict, Any


class NewLaunch(db.Model):
    __tablename__ = 'new_launches'

    id = db.Column(db.Integer, primary_key=True)

    # ==========================================================================
    # PROJECT IDENTIFICATION (aligned with Transaction)
    # ==========================================================================
    project_name = db.Column(db.String(255), unique=True, nullable=False, index=True)
    developer = db.Column(db.String(255), index=True)

    # ==========================================================================
    # LOCATION (aligned with Transaction + GLSTender)
    # ==========================================================================
    district = db.Column(db.String(10), index=True)  # D01-D28, like Transaction
    planning_area = db.Column(db.String(100), index=True)  # Like GLSTender
    market_segment = db.Column(db.String(10), index=True)  # CCR/RCR/OCR, like GLSTender
    address = db.Column(db.Text)

    # ==========================================================================
    # SUPPLY DATA (aligned with GLSTender.estimated_units)
    # ==========================================================================
    total_units = db.Column(db.Integer)

    # Unit breakdown by bedroom (optional)
    units_1br = db.Column(db.Integer)
    units_2br = db.Column(db.Integer)
    units_3br = db.Column(db.Integer)
    units_4br = db.Column(db.Integer)
    units_5br_plus = db.Column(db.Integer)

    # ==========================================================================
    # PRICING DATA (aligned with GLSTender.implied_launch_psf)
    # ==========================================================================
    indicative_psf_low = db.Column(db.Numeric(12, 2))
    indicative_psf_high = db.Column(db.Numeric(12, 2))

    # ==========================================================================
    # PROJECT DETAILS (aligned with Transaction)
    # ==========================================================================
    tenure = db.Column(db.Text)  # 'Freehold', '99-year', '999-year', like Transaction
    property_type = db.Column(db.String(100), default='Condominium')  # Like Transaction
    launch_year = db.Column(db.Integer, index=True)
    expected_launch_date = db.Column(db.Date)
    expected_top_date = db.Column(db.Date)
    site_area_sqft = db.Column(db.Numeric(12, 2))

    # ==========================================================================
    # GLS TENDER LINKING
    # ==========================================================================
    gls_tender_id = db.Column(db.Integer, db.ForeignKey('gls_tenders.id'), nullable=True)
    gls_tender = db.relationship('GLSTender', backref='new_launches')
    land_bid_psf = db.Column(db.Numeric(12, 2))  # From linked GLS tender

    # ==========================================================================
    # DATA PROVENANCE (CSV upload tracking)
    # ==========================================================================
    data_source = db.Column(db.String(255))  # e.g., "EdgeProp", "URA"
    data_confidence = db.Column(db.String(20))  # 'high', 'medium', 'low'

    # ==========================================================================
    # REVIEW STATUS (aligned with GLSTender)
    # ==========================================================================
    needs_review = db.Column(db.Boolean, default=False, index=True)
    review_reason = db.Column(db.Text)

    # ==========================================================================
    # TIMESTAMPS
    # ==========================================================================
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ==========================================================================
    # INDEXES
    # ==========================================================================
    __table_args__ = (
        db.Index('ix_new_launches_segment_year', 'market_segment', 'launch_year'),
        db.Index('ix_new_launches_district_year', 'district', 'launch_year'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            'id': self.id,
            'project_name': self.project_name,
            'developer': self.developer,
            'district': self.district,
            'planning_area': self.planning_area,
            'market_segment': self.market_segment,
            'address': self.address,
            'total_units': self.total_units,
            'units_breakdown': {
                '1br': self.units_1br,
                '2br': self.units_2br,
                '3br': self.units_3br,
                '4br': self.units_4br,
                '5br_plus': self.units_5br_plus,
            } if any([self.units_1br, self.units_2br, self.units_3br,
                      self.units_4br, self.units_5br_plus]) else None,
            'indicative_psf_low': float(self.indicative_psf_low) if self.indicative_psf_low else None,
            'indicative_psf_high': float(self.indicative_psf_high) if self.indicative_psf_high else None,
            'tenure': self.tenure,
            'property_type': self.property_type,
            'launch_year': self.launch_year,
            'expected_launch_date': self.expected_launch_date.isoformat() if self.expected_launch_date else None,
            'expected_top_date': self.expected_top_date.isoformat() if self.expected_top_date else None,
            'site_area_sqft': float(self.site_area_sqft) if self.site_area_sqft else None,
            'gls_tender_id': self.gls_tender_id,
            'land_bid_psf': float(self.land_bid_psf) if self.land_bid_psf else None,
            'data_source': self.data_source,
            'data_confidence': self.data_confidence,
            'needs_review': self.needs_review,
            'review_reason': self.review_reason,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        return result

    def __repr__(self):
        return f"<NewLaunch {self.project_name} ({self.launch_year})>"
