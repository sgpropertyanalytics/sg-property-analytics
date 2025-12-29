"""
Scraped Entity Model - Per-source extraction records.

Stores the raw extracted data from each source before promotion.
One row per entity per source per run.
"""
from datetime import datetime
from models.database import db


class ScrapedEntity(db.Model):
    """Raw extracted entity from a single source."""

    __tablename__ = "scraped_entities"

    id = db.Column(db.Integer, primary_key=True)

    # Entity identification
    entity_type = db.Column(
        db.String(50), nullable=False, index=True
    )  # gls_tender, new_launch, project
    entity_key = db.Column(
        db.String(255), nullable=False, index=True
    )  # Unique key within type

    # Source provenance
    source_domain = db.Column(db.String(255), nullable=False, index=True)
    source_url = db.Column(db.Text, nullable=False)
    source_tier = db.Column(db.String(1), nullable=False)  # A, B, C

    # Extracted data
    extracted = db.Column(db.JSON, nullable=False)
    extracted_hash = db.Column(
        db.String(64), nullable=False, index=True
    )  # SHA256 for change detection

    # Scrape tracking
    run_id = db.Column(
        db.String(36),
        db.ForeignKey("scrape_runs.run_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scraped_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Parse status
    parse_status = db.Column(
        db.String(20), nullable=False, default="success"
    )  # success, partial, failed, schema_mismatch
    parse_errors = db.Column(db.JSON)

    # Schema versioning
    schema_version = db.Column(db.String(20), nullable=False, default="v1")

    __table_args__ = (
        # Unique constraint per source (allows multiple sources for same entity)
        db.UniqueConstraint(
            "entity_type", "entity_key", "source_domain",
            name="uq_scraped_entity_source",
        ),
        db.Index(
            "ix_scraped_entities_type_key", "entity_type", "entity_key"
        ),
        db.Index(
            "ix_scraped_entities_domain_scraped", "source_domain", "scraped_at"
        ),
        db.CheckConstraint(
            "source_tier IN ('A', 'B', 'C')",
            name="scraped_entities_tier_check",
        ),
        db.CheckConstraint(
            "parse_status IN ('success', 'partial', 'failed', 'schema_mismatch')",
            name="scraped_entities_status_check",
        ),
    )

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_key": self.entity_key,
            "source_domain": self.source_domain,
            "source_url": self.source_url,
            "source_tier": self.source_tier,
            "extracted": self.extracted,
            "extracted_hash": self.extracted_hash,
            "run_id": self.run_id,
            "scraped_at": self.scraped_at.isoformat() if self.scraped_at else None,
            "parse_status": self.parse_status,
            "parse_errors": self.parse_errors,
            "schema_version": self.schema_version,
        }

    def __repr__(self):
        return f"<ScrapedEntity {self.entity_type}:{self.entity_key} from {self.source_domain}>"
