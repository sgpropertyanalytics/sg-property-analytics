"""
Scraper Schema Change Model - Tracks detected schema changes.

Used for:
- Alerting when source page structure changes
- Audit trail of parser evolution
- Debug information for failed parses
"""
from datetime import datetime
from models.database import db


class ScraperSchemaChange(db.Model):
    """Tracks schema changes detected in scraped entities."""

    __tablename__ = "scraper_schema_changes"

    id = db.Column(db.Integer, primary_key=True)

    # Entity reference
    entity_type = db.Column(db.String(50), nullable=False, index=True)
    entity_key = db.Column(db.String(255), nullable=False)
    source_domain = db.Column(db.String(255), nullable=False, index=True)

    # Change detection
    previous_hash = db.Column(db.String(64), nullable=False)
    new_hash = db.Column(db.String(64), nullable=False)
    raw_html_hash_changed = db.Column(db.Boolean, nullable=False, default=False)
    extracted_hash_changed = db.Column(db.Boolean, nullable=False, default=True)

    # Change details
    change_type = db.Column(
        db.String(30), nullable=False
    )  # new_fields, removed_fields, value_change, structure_change
    change_details = db.Column(
        db.JSON, nullable=False
    )  # {added_fields, removed_fields, changed_fields}

    # Timing
    detected_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    run_id = db.Column(
        db.String(36),
        db.ForeignKey("scrape_runs.run_id", ondelete="SET NULL"),
        nullable=True,
    )

    # Review
    acknowledged = db.Column(db.Boolean, default=False, index=True)
    acknowledged_at = db.Column(db.DateTime)
    acknowledged_by = db.Column(db.String(100))
    resolution_notes = db.Column(db.Text)

    __table_args__ = (
        db.Index("ix_schema_changes_unack", "acknowledged"),
        db.Index("ix_schema_changes_type_detected", "entity_type", "detected_at"),
        db.Index("ix_schema_changes_domain", "source_domain", "detected_at"),
        db.CheckConstraint(
            "change_type IN ('new_fields', 'removed_fields', 'value_change', 'type_change', 'structure_change')",
            name="schema_changes_type_check",
        ),
    )

    def acknowledge(self, acknowledged_by: str, notes: str = None):
        """Mark schema change as acknowledged."""
        self.acknowledged = True
        self.acknowledged_at = datetime.utcnow()
        self.acknowledged_by = acknowledged_by
        self.resolution_notes = notes

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_key": self.entity_key,
            "source_domain": self.source_domain,
            "change_type": self.change_type,
            "change_details": self.change_details,
            "detected_at": self.detected_at.isoformat() if self.detected_at else None,
            "run_id": self.run_id,
            "acknowledged": self.acknowledged,
            "acknowledged_by": self.acknowledged_by,
        }

    def __repr__(self):
        return f"<SchemaChange {self.entity_type}:{self.source_domain} type={self.change_type}>"
