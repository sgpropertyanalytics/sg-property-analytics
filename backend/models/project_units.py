"""
Project Units Model - Canonical Registry of Condo Projects + Unit Counts

This table serves as the single source of truth for:
1. Project existence (every condo that appears in transactions)
2. Unit counts (total_units, with provenance tracking)

Data sources:
- CSV import (backend/data/new_launch_units.csv) - historical new launch data
- Transactions table - project existence discovered from transaction records
- External scrapers - unit verification from EdgeProp, 99.co, etc.

Key design decisions:
- project_key is a normalized/slugified version of project_name for stable lookups
- units_status explicitly tracks whether units are verified, unknown, or in conflict
- Supports NULL total_units (project exists but units unknown)

Usage:
    from models import ProjectUnits

    # Lookup by normalized key
    project = ProjectUnits.query.filter_by(project_key='normanton-park').first()

    # Get all projects with unknown units in a district
    unknown = ProjectUnits.query.filter_by(
        district='D15',
        units_status='unknown'
    ).all()
"""
from models.database import db
from datetime import datetime
from typing import Dict, Any, Optional


# =============================================================================
# UNITS STATUS ENUM VALUES
# =============================================================================
UNITS_STATUS_VERIFIED = 'verified'   # Has unit count from trusted source
UNITS_STATUS_UNKNOWN = 'unknown'     # Exists in transactions, units not known
UNITS_STATUS_CONFLICT = 'conflict'   # sold > total_units, needs review


class ProjectUnits(db.Model):
    """
    Canonical registry of condo projects and their unit counts.

    Every project that appears in transactions should have a row here.
    Projects without known unit counts have total_units=NULL and units_status='unknown'.
    """
    __tablename__ = 'project_units'

    id = db.Column(db.Integer, primary_key=True)

    # ==========================================================================
    # PROJECT IDENTIFICATION
    # ==========================================================================
    # Normalized key for stable lookups (slugified, lowercase)
    # Example: "THE SAIL @ MARINA BAY" -> "sail-at-marina-bay"
    project_key = db.Column(db.String(255), unique=True, nullable=False, index=True)

    # Original project name as first encountered (preserves casing/punctuation)
    project_name_raw = db.Column(db.String(255), nullable=False)

    # Canonical display name (normalized but human-readable)
    # Example: "SAIL AT MARINA BAY"
    project_name_canonical = db.Column(db.String(255), nullable=False)

    # ==========================================================================
    # LOCATION
    # ==========================================================================
    district = db.Column(db.String(10), index=True)  # D01-D28

    # ==========================================================================
    # UNIT DATA
    # ==========================================================================
    total_units = db.Column(db.Integer, nullable=True)  # NULL if unknown

    # Status of unit data
    # 'verified' - confirmed from trusted source
    # 'unknown' - project exists but units not known
    # 'conflict' - sold count > total_units, needs review
    units_status = db.Column(
        db.String(20),
        nullable=False,
        default=UNITS_STATUS_UNKNOWN,
        index=True
    )

    # ==========================================================================
    # PROJECT METADATA (Optional, populated when available)
    # ==========================================================================
    developer = db.Column(db.String(255))
    tenure = db.Column(db.Text)  # 'Freehold', '99-year', '999-year'
    top_year = db.Column(db.Integer)  # Temporary Occupation Permit year

    # ==========================================================================
    # DATA PROVENANCE
    # ==========================================================================
    # Where the unit count came from
    # 'csv' - from new_launch_units.csv
    # 'scraper:edgeprop' - from EdgeProp scraper
    # 'scraper:99co' - from 99.co scraper
    # 'manual' - manually entered
    # 'transactions' - inferred from transactions (existence only, no units)
    data_source = db.Column(db.String(100))

    # Confidence in the unit count (0.0 - 1.0)
    # NULL if units_status is 'unknown'
    confidence_score = db.Column(db.Numeric(3, 2))

    # When the unit count was last verified against external source
    last_verified_at = db.Column(db.DateTime)

    # ==========================================================================
    # REVIEW FLAGS
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
        # Composite index for common query patterns
        db.Index('ix_project_units_district_status', 'district', 'units_status'),
        # Index for finding projects needing review
        db.Index('ix_project_units_needs_review', 'needs_review'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'project_key': self.project_key,
            'project_name_raw': self.project_name_raw,
            'project_name_canonical': self.project_name_canonical,
            'district': self.district,
            'total_units': self.total_units,
            'units_status': self.units_status,
            'developer': self.developer,
            'tenure': self.tenure,
            'top_year': self.top_year,
            'data_source': self.data_source,
            'confidence_score': float(self.confidence_score) if self.confidence_score else None,
            'last_verified_at': self.last_verified_at.isoformat() if self.last_verified_at else None,
            'needs_review': self.needs_review,
            'review_reason': self.review_reason,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def get_by_key(cls, project_key: str) -> Optional['ProjectUnits']:
        """Look up project by normalized key."""
        return cls.query.filter_by(project_key=project_key).first()

    @classmethod
    def get_district_coverage(cls, district: str) -> Dict[str, Any]:
        """Get coverage stats for a district."""
        total = cls.query.filter_by(district=district).count()
        with_units = cls.query.filter(
            cls.district == district,
            cls.total_units.isnot(None),
            cls.units_status == UNITS_STATUS_VERIFIED
        ).count()

        return {
            'district': district,
            'total_projects': total,
            'projects_with_units': with_units,
            'coverage_pct': round(100 * with_units / total, 1) if total > 0 else 0.0,
        }

    def __repr__(self):
        units_str = str(self.total_units) if self.total_units else '?'
        return f"<ProjectUnits {self.project_key} ({units_str} units, {self.units_status})>"
