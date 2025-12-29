"""
Canonical Entity Model - Merged truth from multiple sources.

The single source of truth for each entity, updated via promotion rules.
"""
from datetime import datetime
from models.database import db


class CanonicalEntity(db.Model):
    """Merged canonical entity - the app's source of truth."""

    __tablename__ = "canonical_entities"

    id = db.Column(db.Integer, primary_key=True)

    # Entity identification
    entity_type = db.Column(
        db.String(50), nullable=False, index=True
    )  # gls_tender, new_launch, project
    entity_key = db.Column(
        db.String(255), nullable=False, index=True
    )  # Unique key within type

    # Canonical data
    canonical = db.Column(db.JSON, nullable=False)
    canonical_hash = db.Column(
        db.String(64), nullable=False, index=True
    )  # SHA256 for change detection

    # Confidence and status
    confidence_score = db.Column(
        db.Numeric(5, 4), nullable=False, default=1.0
    )  # 0.0000 to 1.0000
    status = db.Column(
        db.String(20), nullable=False, default="active", index=True
    )  # active, deprecated, needs_review, pending

    # Provenance tracking
    provenance = db.Column(
        db.JSON, nullable=False, default=list
    )  # [{source, scraped_entity_id, tier, contributed_fields, at}]
    highest_tier = db.Column(
        db.String(1), nullable=False
    )  # A, B, C - highest authority tier that contributed

    # Lifecycle
    first_seen_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_promoted_at = db.Column(db.DateTime)

    __table_args__ = (
        db.UniqueConstraint(
            "entity_type", "entity_key",
            name="uq_canonical_entity",
        ),
        db.Index("ix_canonical_type_status", "entity_type", "status"),
        db.CheckConstraint(
            "status IN ('active', 'deprecated', 'needs_review', 'pending')",
            name="canonical_entities_status_check",
        ),
        db.CheckConstraint(
            "highest_tier IN ('A', 'B', 'C')",
            name="canonical_entities_tier_check",
        ),
        db.CheckConstraint(
            "confidence_score >= 0 AND confidence_score <= 1",
            name="canonical_entities_confidence_check",
        ),
    )

    def update_from_source(
        self,
        source_domain: str,
        source_tier: str,
        scraped_entity_id: int,
        contributed_fields: list,
        new_data: dict,
    ):
        """
        Update canonical data from a source.

        Args:
            source_domain: Domain of the source
            source_tier: Tier of the source (A, B, C)
            scraped_entity_id: ID of the scraped entity
            contributed_fields: List of field names being updated
            new_data: Dictionary of field updates
        """
        from ..utils.hashing import compute_json_hash

        # Merge new data
        self.canonical = {**self.canonical, **new_data}
        self.canonical_hash = compute_json_hash(self.canonical)
        self.last_updated_at = datetime.utcnow()
        self.last_promoted_at = datetime.utcnow()

        # Add to provenance
        if self.provenance is None:
            self.provenance = []

        self.provenance.append({
            "source": source_domain,
            "scraped_entity_id": scraped_entity_id,
            "tier": source_tier,
            "contributed_fields": contributed_fields,
            "at": datetime.utcnow().isoformat(),
        })

        # Update highest tier if better
        tier_priority = {"A": 1, "B": 2, "C": 3}
        current_priority = tier_priority.get(self.highest_tier, 99)
        new_priority = tier_priority.get(source_tier, 99)
        if new_priority < current_priority:
            self.highest_tier = source_tier

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_key": self.entity_key,
            "canonical": self.canonical,
            "canonical_hash": self.canonical_hash,
            "confidence_score": float(self.confidence_score) if self.confidence_score else None,
            "status": self.status,
            "highest_tier": self.highest_tier,
            "first_seen_at": self.first_seen_at.isoformat() if self.first_seen_at else None,
            "last_updated_at": self.last_updated_at.isoformat() if self.last_updated_at else None,
            "last_promoted_at": self.last_promoted_at.isoformat() if self.last_promoted_at else None,
            "provenance_count": len(self.provenance) if self.provenance else 0,
        }

    def __repr__(self):
        return f"<CanonicalEntity {self.entity_type}:{self.entity_key} tier={self.highest_tier}>"
