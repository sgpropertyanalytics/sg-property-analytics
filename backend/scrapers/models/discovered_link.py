"""
Discovered Link Model - URL discovery queue.

Stores URLs discovered during DISCOVERY mode scraping.
Used for queueing future scrape targets.
"""
from datetime import datetime
from models.database import db


class DiscoveredLink(db.Model):
    """Discovered URL pending processing."""

    __tablename__ = "discovered_links"

    id = db.Column(db.Integer, primary_key=True)

    # Link details
    url = db.Column(db.Text, nullable=False)
    url_hash = db.Column(
        db.String(64), nullable=False, unique=True, index=True
    )  # SHA256 for dedup
    source_domain = db.Column(db.String(255), nullable=False, index=True)

    # Discovery metadata
    discovered_from_url = db.Column(db.Text)  # Parent URL that contained this link
    discovered_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    run_id = db.Column(
        db.String(36),
        db.ForeignKey("scrape_runs.run_id", ondelete="SET NULL"),
        nullable=True,
    )

    # Processing status
    status = db.Column(
        db.String(20), nullable=False, default="pending", index=True
    )  # pending, queued, processing, completed, failed, skipped
    priority = db.Column(db.Integer, default=0)  # Higher = process sooner

    # Classification hints
    estimated_entity_type = db.Column(db.String(50))  # gls_tender, new_launch, etc.
    estimated_tier = db.Column(db.String(1))  # A, B, C

    # Processing tracking
    processed_at = db.Column(db.DateTime)
    process_result = db.Column(db.String(50))  # success, no_data, error
    process_notes = db.Column(db.Text)

    __table_args__ = (
        db.Index(
            "ix_discovered_links_pending",
            "status", "priority",
        ),
        db.Index(
            "ix_discovered_links_domain_discovered",
            "source_domain", "discovered_at",
        ),
        db.CheckConstraint(
            "status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'skipped')",
            name="discovered_links_status_check",
        ),
    )

    def queue(self, priority: int = 0):
        """Queue link for processing."""
        self.status = "queued"
        self.priority = priority

    def start_processing(self):
        """Mark link as being processed."""
        self.status = "processing"

    def complete(self, result: str, notes: str = None):
        """Mark link as processed."""
        self.status = "completed"
        self.processed_at = datetime.utcnow()
        self.process_result = result
        self.process_notes = notes

    def fail(self, notes: str = None):
        """Mark link as failed."""
        self.status = "failed"
        self.processed_at = datetime.utcnow()
        self.process_result = "error"
        self.process_notes = notes

    def skip(self, reason: str = None):
        """Skip this link."""
        self.status = "skipped"
        self.processed_at = datetime.utcnow()
        self.process_notes = reason

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "url": self.url,
            "source_domain": self.source_domain,
            "status": self.status,
            "priority": self.priority,
            "estimated_entity_type": self.estimated_entity_type,
            "estimated_tier": self.estimated_tier,
            "discovered_at": self.discovered_at.isoformat() if self.discovered_at else None,
            "processed_at": self.processed_at.isoformat() if self.processed_at else None,
        }

    def __repr__(self):
        return f"<DiscoveredLink {self.source_domain} status={self.status}>"
