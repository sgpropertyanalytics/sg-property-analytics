"""
Ingestion Run Model - Job tracking for ingestion executions.

Tracks:
- Run lifecycle (pending -> running -> completed/failed)
- Statistics (pages fetched, items extracted, errors)
- Configuration snapshot for reproducibility
- Source type (scrape, csv_upload, api, manual)

Note: This was previously named ScrapeRun. The alias is kept for backwards compatibility.
"""
from datetime import datetime
from enum import Enum
from uuid import uuid4
from models.database import db


class SourceType(str, Enum):
    """Type of data ingestion source."""
    SCRAPE = "scrape"
    CSV_UPLOAD = "csv_upload"
    API = "api"
    MANUAL = "manual"


class IngestionRun(db.Model):
    """Tracks individual ingestion run executions."""

    __tablename__ = "ingestion_runs"

    id = db.Column(db.Integer, primary_key=True)
    run_id = db.Column(
        db.String(36),
        unique=True,
        nullable=False,
        default=lambda: str(uuid4()),
        index=True,
    )

    # Scraper/source identification
    scraper_name = db.Column(db.String(100), nullable=False, index=True)
    source_domain = db.Column(db.String(255), nullable=False, index=True)
    source_tier = db.Column(db.String(1), nullable=False)  # A, B, C
    source_type = db.Column(
        db.String(20),
        nullable=False,
        default=SourceType.SCRAPE.value,
        index=True,
    )  # scrape, csv_upload, api, manual

    # Run lifecycle
    status = db.Column(
        db.String(20),
        nullable=False,
        default="pending",
        index=True,
    )  # pending, running, completed, failed, cancelled
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)

    # Run statistics
    pages_fetched = db.Column(db.Integer, default=0)
    items_extracted = db.Column(db.Integer, default=0)
    items_promoted = db.Column(db.Integer, default=0)
    errors_count = db.Column(db.Integer, default=0)

    # Configuration snapshot (for reproducibility)
    config_snapshot = db.Column(db.JSON, nullable=False, default=dict)

    # Error tracking
    error_message = db.Column(db.Text)
    error_traceback = db.Column(db.Text)

    # Metadata
    triggered_by = db.Column(db.String(50), default="manual")  # manual, cron, webhook
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    scraped_entities = db.relationship(
        "ScrapedEntity",
        backref="run",
        lazy="dynamic",
        cascade="all, delete-orphan",
        foreign_keys="ScrapedEntity.run_id",
        primaryjoin="IngestionRun.run_id == foreign(ScrapedEntity.run_id)",
    )

    __table_args__ = (
        db.Index("ix_ingestion_runs_scraper_started", "scraper_name", "started_at"),
        db.Index("ix_ingestion_runs_domain_started", "source_domain", "started_at"),
        db.Index("ix_ingestion_runs_source_type_started", "source_type", "started_at"),
        db.CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'cancelled')",
            name="ingestion_runs_status_check",
        ),
        db.CheckConstraint(
            "source_tier IN ('A', 'B', 'C')",
            name="ingestion_runs_tier_check",
        ),
        db.CheckConstraint(
            "source_type IN ('scrape', 'csv_upload', 'api', 'manual')",
            name="ingestion_runs_source_type_check",
        ),
    )

    def start(self):
        """Mark run as started."""
        self.status = "running"
        self.started_at = datetime.utcnow()

    def complete(self, stats: dict = None):
        """Mark run as completed with stats."""
        self.status = "completed"
        self.completed_at = datetime.utcnow()
        if stats:
            self.pages_fetched = stats.get("pages_fetched", self.pages_fetched)
            self.items_extracted = stats.get("items_extracted", self.items_extracted)
            self.items_promoted = stats.get("items_promoted", self.items_promoted)
            self.errors_count = stats.get("errors_count", self.errors_count)

    def fail(self, error: Exception):
        """Mark run as failed with error."""
        import traceback

        self.status = "failed"
        self.completed_at = datetime.utcnow()
        self.error_message = str(error)
        self.error_traceback = traceback.format_exc()

    @property
    def duration_seconds(self) -> float:
        """Calculate run duration in seconds."""
        if not self.started_at:
            return 0
        end = self.completed_at or datetime.utcnow()
        return (end - self.started_at).total_seconds()

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "run_id": self.run_id,
            "scraper_name": self.scraper_name,
            "source_domain": self.source_domain,
            "source_tier": self.source_tier,
            "source_type": self.source_type,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": self.duration_seconds,
            "pages_fetched": self.pages_fetched,
            "items_extracted": self.items_extracted,
            "items_promoted": self.items_promoted,
            "errors_count": self.errors_count,
            "triggered_by": self.triggered_by,
            "error_message": self.error_message,
        }

    def __repr__(self):
        return f"<IngestionRun {self.run_id[:8]} {self.scraper_name} {self.status}>"


# Backwards compatibility alias
ScrapeRun = IngestionRun
