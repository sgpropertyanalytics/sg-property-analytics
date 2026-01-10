"""
URASyncRun Model - Track URA API sync runs

Each sync run has:
- Timing (started_at, finished_at)
- Status (running, succeeded, failed, cancelled)
- Configuration (revision_window, cutoff_date, mode)
- Counters (skip reasons from mapper)
- Totals (raw, mapped, inserted, updated)
- Comparison results (vs baseline)
"""
from models.database import db
from datetime import datetime
import uuid


class URASyncRun(db.Model):
    __tablename__ = 'ura_sync_runs'

    # Primary key - UUID for unique run identification
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Timing
    started_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    finished_at = db.Column(db.DateTime)

    # Status: running | succeeded | failed | cancelled
    status = db.Column(db.Text, nullable=False, default='running', index=True)

    # Configuration
    revision_window_months = db.Column(db.Integer, nullable=False, default=3)
    cutoff_date = db.Column(db.Date)  # Only sync transactions >= this date
    mode = db.Column(db.Text, nullable=False, default='shadow')  # shadow | production | dry_run

    # Token tracking
    token_refreshed = db.Column(db.Boolean, default=False)
    token_obtained_at = db.Column(db.DateTime)

    # Batch progress
    batches_total = db.Column(db.Integer, default=4)
    batches_completed = db.Column(db.Integer, default=0)
    current_batch = db.Column(db.Integer)

    # Granular skip counters (from mapper) - JSONB
    counters = db.Column(db.JSON, default=dict)
    # Expected: {skip_invalid_date, skip_invalid_price, skip_invalid_area, ...}

    # Totals - JSONB
    totals = db.Column(db.JSON, default=dict)
    # Expected: {raw_projects, raw_transactions, mapped_rows, inserted_rows, updated_rows, unchanged_rows}

    # API response metadata - JSONB
    api_response_times = db.Column(db.JSON)  # {"batch_1": 1.23, ...}
    api_retry_counts = db.Column(db.JSON)    # {"batch_1": 0, ...}

    # Comparison results (populated after sync)
    comparison_baseline_run_id = db.Column(db.String(36))
    comparison_results = db.Column(db.JSON)

    # Versioning
    git_sha = db.Column(db.Text)
    mapper_version = db.Column(db.Text)

    # Error tracking
    error_message = db.Column(db.Text)
    error_stage = db.Column(db.Text)  # 'token', 'fetch', 'map', 'insert', 'compare'
    error_details = db.Column(db.JSON)

    # Notes
    notes = db.Column(db.Text)
    triggered_by = db.Column(db.Text, default='cron')  # cron | manual | backfill | test

    # Relationship to transactions
    transactions = db.relationship(
        'Transaction',
        backref='sync_run',
        lazy='dynamic',
        foreign_keys='Transaction.run_id'
    )

    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'finished_at': self.finished_at.isoformat() if self.finished_at else None,
            'status': self.status,
            'mode': self.mode,
            'revision_window_months': self.revision_window_months,
            'cutoff_date': self.cutoff_date.isoformat() if self.cutoff_date else None,
            'token_refreshed': self.token_refreshed,
            'batches_total': self.batches_total,
            'batches_completed': self.batches_completed,
            'counters': self.counters,
            'totals': self.totals,
            'api_response_times': self.api_response_times,
            'comparison_baseline_run_id': self.comparison_baseline_run_id,
            'comparison_results': self.comparison_results,
            'git_sha': self.git_sha,
            'error_message': self.error_message,
            'error_stage': self.error_stage,
            'triggered_by': self.triggered_by,
            'notes': self.notes,
        }

    def mark_succeeded(self, totals: dict = None, counters: dict = None):
        """Mark run as succeeded with final stats."""
        self.status = 'succeeded'
        self.finished_at = datetime.utcnow()
        if totals:
            self.totals = totals
        if counters:
            self.counters = counters

    def mark_failed(self, error_message: str, error_stage: str = None, error_details: dict = None):
        """Mark run as failed with error info."""
        self.status = 'failed'
        self.finished_at = datetime.utcnow()
        self.error_message = error_message
        self.error_stage = error_stage
        self.error_details = error_details

    def update_batch_progress(self, batch_num: int, response_time: float = None, retry_count: int = 0):
        """Update batch progress after completing a batch."""
        self.current_batch = batch_num
        self.batches_completed = batch_num

        # Track response times
        if response_time is not None:
            if self.api_response_times is None:
                self.api_response_times = {}
            self.api_response_times[f'batch_{batch_num}'] = response_time

        # Track retry counts
        if retry_count > 0:
            if self.api_retry_counts is None:
                self.api_retry_counts = {}
            self.api_retry_counts[f'batch_{batch_num}'] = retry_count

    @classmethod
    def get_latest_by_source(cls, source: str = 'ura_api', status: str = 'succeeded'):
        """Get the latest successful run for a given source."""
        return cls.query.filter(
            cls.status == status
        ).order_by(cls.started_at.desc()).first()

    @classmethod
    def get_latest_csv_run(cls):
        """Get the latest CSV-based run (for comparison baseline)."""
        # CSV runs are tracked in etl_batches, not here
        # This is a placeholder - comparator will handle differently
        return None
