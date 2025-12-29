"""
Entity Candidate Model - Pending review queue.

Stores entities that need manual review before promotion:
- Tier C sources (discovery only)
- Conflicting data between sources
- Schema changes detected
- Low confidence scores
"""
from datetime import datetime
from models.database import db


class EntityCandidate(db.Model):
    """Entity candidate awaiting review/promotion."""

    __tablename__ = "entity_candidates"

    id = db.Column(db.Integer, primary_key=True)

    # Entity identification
    entity_type = db.Column(
        db.String(50), nullable=False, index=True
    )  # gls_tender, new_launch, project
    entity_key = db.Column(
        db.String(255), nullable=False, index=True
    )  # Unique key within type

    # Candidate data
    candidate = db.Column(db.JSON, nullable=False)
    candidate_hash = db.Column(db.String(64), nullable=False)

    # Review metadata
    reason = db.Column(
        db.String(50), nullable=False
    )  # tier_c_only, conflict, schema_change, low_confidence, field_mismatch
    review_status = db.Column(
        db.String(20), nullable=False, default="open", index=True
    )  # open, approved, rejected, merged

    # Source information
    source_domain = db.Column(db.String(255), nullable=False)
    source_tier = db.Column(db.String(1), nullable=False)  # A, B, C
    scraped_entity_id = db.Column(
        db.Integer,
        db.ForeignKey("scraped_entities.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Conflict details (for conflict reason)
    conflict_details = db.Column(db.JSON)  # {field: {expected, actual, sources}}

    # Review tracking
    reviewed_by = db.Column(db.String(100))
    reviewed_at = db.Column(db.DateTime)
    review_notes = db.Column(db.Text)

    # Lifecycle
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint(
            "entity_type", "entity_key", "source_domain", "candidate_hash",
            name="uq_candidate_source_hash",
        ),
        db.Index("ix_candidates_review", "review_status"),
        db.Index("ix_candidates_type_status", "entity_type", "review_status"),
        db.Index("ix_candidates_reason", "reason"),
        db.CheckConstraint(
            "reason IN ('tier_c_only', 'conflict', 'schema_change', 'low_confidence', 'field_mismatch')",
            name="entity_candidates_reason_check",
        ),
        db.CheckConstraint(
            "review_status IN ('open', 'approved', 'rejected', 'merged')",
            name="entity_candidates_status_check",
        ),
        db.CheckConstraint(
            "source_tier IN ('A', 'B', 'C')",
            name="entity_candidates_tier_check",
        ),
    )

    def approve(self, reviewed_by: str, notes: str = None):
        """Approve the candidate for promotion."""
        self.review_status = "approved"
        self.reviewed_by = reviewed_by
        self.reviewed_at = datetime.utcnow()
        self.review_notes = notes

    def reject(self, reviewed_by: str, notes: str = None):
        """Reject the candidate."""
        self.review_status = "rejected"
        self.reviewed_by = reviewed_by
        self.reviewed_at = datetime.utcnow()
        self.review_notes = notes

    def merge(self, reviewed_by: str, notes: str = None):
        """Mark as merged into canonical."""
        self.review_status = "merged"
        self.reviewed_by = reviewed_by
        self.reviewed_at = datetime.utcnow()
        self.review_notes = notes

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_key": self.entity_key,
            "candidate": self.candidate,
            "reason": self.reason,
            "review_status": self.review_status,
            "source_domain": self.source_domain,
            "source_tier": self.source_tier,
            "conflict_details": self.conflict_details,
            "reviewed_by": self.reviewed_by,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "review_notes": self.review_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<EntityCandidate {self.entity_type}:{self.entity_key} reason={self.reason}>"
