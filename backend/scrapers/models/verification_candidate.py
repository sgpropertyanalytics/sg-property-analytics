"""
Verification Candidate Model - Cross-validation results pending review.

Stores the comparison between:
- Current value (from CSV, database, or computed)
- Verified value (aggregated from Tier B sources)

Used for manual review before any corrections are applied.

Key design: 3-source minimum required for auto-confirmation.
- 3+ agreeing sources → can auto-confirm (if matches current)
- < 3 agreeing sources → always goes to review queue
"""
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional
from models.database import db


# Minimum number of agreeing sources for auto-confirmation
MIN_SOURCES_FOR_AUTO_CONFIRM = 3


class VerificationCandidate(db.Model):
    """Verification result from cross-validating against Tier B sources."""

    __tablename__ = "verification_candidates"

    id = db.Column(db.Integer, primary_key=True)

    # ==========================================================================
    # ENTITY IDENTIFICATION
    # ==========================================================================
    entity_type = db.Column(
        db.String(50), nullable=False, index=True
    )  # 'unit_count', 'upcoming_launch', 'gls_tender', 'project_location'
    entity_key = db.Column(
        db.String(255), nullable=False, index=True
    )  # project_name or release_id

    # ==========================================================================
    # CURRENT VALUE (from our system)
    # ==========================================================================
    current_value = db.Column(db.JSON, nullable=False)
    # Example: {"total_units": 1040, "developer": "CDL"}
    current_source = db.Column(db.String(50))
    # Values: 'csv', 'database', 'computed'

    # ==========================================================================
    # VERIFIED VALUE (from Tier B sources)
    # ==========================================================================
    verified_value = db.Column(db.JSON, nullable=False)
    # Example: {"total_units": 1040, "sources_count": 3}
    verified_sources = db.Column(db.JSON, nullable=False)
    # Example: [
    #   {"source": "propertyguru.com.sg", "value": 1040, "url": "...", "scraped_at": "..."},
    #   {"source": "edgeprop.sg", "value": 1040, "url": "...", "scraped_at": "..."},
    # ]

    # ==========================================================================
    # SOURCE AGREEMENT (for 3-source minimum rule)
    # ==========================================================================
    agreeing_source_count = db.Column(db.Integer, nullable=False, default=0)
    total_source_count = db.Column(db.Integer, nullable=False, default=0)

    # ==========================================================================
    # COMPARISON RESULT
    # ==========================================================================
    verification_status = db.Column(
        db.String(20), nullable=False, default="pending", index=True
    )
    # Values: 'pending', 'confirmed', 'mismatch', 'unverified', 'conflict'
    # - pending: awaiting processing
    # - confirmed: verified value matches current value
    # - mismatch: verified value differs from current value
    # - unverified: insufficient sources (< 3)
    # - conflict: sources disagree with each other

    confidence_score = db.Column(db.Numeric(5, 4))
    # 0.0000 to 1.0000 based on source agreement

    # ==========================================================================
    # FIELD-LEVEL MISMATCHES
    # ==========================================================================
    field_mismatches = db.Column(db.JSON)
    # Example: [
    #   {"field": "total_units", "current": 1040, "verified": 1050, "delta_pct": 0.0096, "tolerance": 0.0},
    # ]

    # ==========================================================================
    # REVIEW WORKFLOW
    # ==========================================================================
    review_status = db.Column(
        db.String(20), nullable=False, default="open", index=True
    )
    # Values: 'open', 'approved', 'rejected', 'auto_confirmed', 'deferred'
    # - open: needs manual review
    # - approved: reviewer accepted the verification
    # - rejected: reviewer dismissed the verification
    # - auto_confirmed: 3+ sources agreed and matched current value
    # - deferred: postponed for later review

    reviewed_by = db.Column(db.String(100))
    reviewed_at = db.Column(db.DateTime)
    review_notes = db.Column(db.Text)

    resolution = db.Column(db.String(30))
    # Values: 'keep_current', 'update_to_verified', 'needs_investigation', 'source_error'
    # - keep_current: verified value was wrong, keep our value
    # - update_to_verified: update domain table to verified value
    # - needs_investigation: requires deeper analysis
    # - source_error: Tier B source had incorrect data

    # ==========================================================================
    # RUN TRACKING
    # ==========================================================================
    run_id = db.Column(db.String(36), nullable=False)
    verified_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # ==========================================================================
    # LIFECYCLE
    # ==========================================================================
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ==========================================================================
    # CONSTRAINTS
    # ==========================================================================
    __table_args__ = (
        db.UniqueConstraint(
            "entity_type", "entity_key", "run_id",
            name="uq_verification_entity_run",
        ),
        db.Index("ix_verification_candidates_status", "verification_status"),
        db.Index("ix_verification_candidates_review", "review_status"),
        db.Index("ix_verification_candidates_type_status", "entity_type", "verification_status"),
        db.Index("ix_verification_candidates_run", "run_id"),
        db.Index("ix_verification_candidates_entity", "entity_type", "entity_key"),
        db.CheckConstraint(
            "verification_status IN ('pending', 'confirmed', 'mismatch', 'unverified', 'conflict')",
            name="verification_candidates_status_check",
        ),
        db.CheckConstraint(
            "review_status IN ('open', 'approved', 'rejected', 'auto_confirmed', 'deferred')",
            name="verification_candidates_review_check",
        ),
    )

    # ==========================================================================
    # HELPER METHODS
    # ==========================================================================

    def can_auto_confirm(self) -> bool:
        """
        Check if this verification can be auto-confirmed.

        Auto-confirmation requires:
        1. At least 3 sources agree on the verified value
        2. Verified value matches current value (no mismatch)
        """
        return (
            self.agreeing_source_count >= MIN_SOURCES_FOR_AUTO_CONFIRM
            and self.verification_status == "confirmed"
        )

    def auto_confirm(self) -> bool:
        """
        Attempt to auto-confirm this verification.

        Returns True if auto-confirmed, False if manual review required.
        """
        if self.can_auto_confirm():
            self.review_status = "auto_confirmed"
            self.reviewed_at = datetime.utcnow()
            self.review_notes = f"Auto-confirmed: {self.agreeing_source_count} sources agree"
            self.resolution = "keep_current"
            return True
        return False

    def approve(self, reviewed_by: str, resolution: str, notes: str = None):
        """Approve the verification with a resolution."""
        self.review_status = "approved"
        self.reviewed_by = reviewed_by
        self.reviewed_at = datetime.utcnow()
        self.resolution = resolution
        self.review_notes = notes

    def reject(self, reviewed_by: str, notes: str = None):
        """Reject the verification (source data was wrong)."""
        self.review_status = "rejected"
        self.reviewed_by = reviewed_by
        self.reviewed_at = datetime.utcnow()
        self.resolution = "source_error"
        self.review_notes = notes

    def defer(self, reviewed_by: str, notes: str = None):
        """Defer the verification for later review."""
        self.review_status = "deferred"
        self.reviewed_by = reviewed_by
        self.reviewed_at = datetime.utcnow()
        self.review_notes = notes

    def get_source_domains(self) -> List[str]:
        """Get list of source domains that contributed to verification."""
        if not self.verified_sources:
            return []
        return [s.get("source") for s in self.verified_sources if s.get("source")]

    def get_mismatch_fields(self) -> List[str]:
        """Get list of fields that have mismatches."""
        if not self.field_mismatches:
            return []
        return [m.get("field") for m in self.field_mismatches if m.get("field")]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_key": self.entity_key,
            "current_value": self.current_value,
            "current_source": self.current_source,
            "verified_value": self.verified_value,
            "verified_sources": self.verified_sources,
            "agreeing_source_count": self.agreeing_source_count,
            "total_source_count": self.total_source_count,
            "verification_status": self.verification_status,
            "confidence_score": float(self.confidence_score) if self.confidence_score else None,
            "field_mismatches": self.field_mismatches,
            "review_status": self.review_status,
            "reviewed_by": self.reviewed_by,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "review_notes": self.review_notes,
            "resolution": self.resolution,
            "run_id": self.run_id,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            # Computed helpers
            "can_auto_confirm": self.can_auto_confirm(),
            "source_domains": self.get_source_domains(),
            "mismatch_fields": self.get_mismatch_fields(),
        }

    def to_summary_dict(self) -> Dict[str, Any]:
        """Convert to summary dictionary for list views."""
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_key": self.entity_key,
            "verification_status": self.verification_status,
            "review_status": self.review_status,
            "agreeing_source_count": self.agreeing_source_count,
            "confidence_score": float(self.confidence_score) if self.confidence_score else None,
            "mismatch_count": len(self.field_mismatches) if self.field_mismatches else 0,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
        }

    def __repr__(self):
        return (
            f"<VerificationCandidate {self.entity_type}:{self.entity_key} "
            f"status={self.verification_status} sources={self.agreeing_source_count}/{self.total_source_count}>"
        )
