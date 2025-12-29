"""
ETL Run Context

Unified context object for ETL pipeline runs.
Prevents "threading parameters everywhere" and keeps the pipeline consistent.

Usage:
    ctx = RunContext()
    ctx.schema_version = "1.0.0"
    ctx.rules_version = registry.get_version()

    # During processing
    ctx.rows_loaded += len(batch)

    # After completion
    save_batch_record(ctx)
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Any, Optional, List
from uuid import uuid4


@dataclass
class RunContext:
    """
    Shared context across all ETL stages.

    This object is passed through the entire pipeline, accumulating
    state as each stage completes. It's then serialized to the
    etl_batches table for audit purposes.
    """

    # Batch identification
    batch_id: str = field(default_factory=lambda: str(uuid4()))

    # Versioning for reproducibility
    schema_version: str = ""
    rules_version: str = ""
    contract_hash: str = ""
    header_fingerprint: str = ""

    # Run configuration
    run_mode: str = "full"  # plan | stage-only | promote | full

    # Timing
    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

    # Status
    status: str = "staging"  # staging | validating | promoting | completed | failed

    # File tracking
    file_fingerprints: Dict[str, str] = field(default_factory=dict)
    total_files: int = 0

    # Contract compatibility report
    contract_report: Dict[str, Any] = field(default_factory=dict)

    # Source reconciliation (for audit: source = loaded + rejected + skipped)
    source_row_count: Optional[int] = None  # Total raw rows in CSV files
    rows_rejected: int = 0  # Failed parse/validation
    rows_skipped: int = 0  # Empty rows, header rows in middle, etc.

    # Row counts by stage
    rows_loaded: int = 0
    rows_after_dedup: int = 0
    rows_outliers_marked: int = 0
    rows_promoted: int = 0
    rows_skipped_collision: int = 0

    # Validation
    validation_issues: List[Dict[str, Any]] = field(default_factory=list)
    semantic_warnings: List[Dict[str, Any]] = field(default_factory=list)
    validation_passed: bool = True

    # Error state
    error_message: Optional[str] = None
    error_stage: Optional[str] = None

    # Audit
    triggered_by: str = "manual"

    def mark_stage(self, stage: str):
        """Update status to current stage."""
        self.status = stage

    def add_validation_issue(self, issue_type: str, message: str, **details):
        """Add a validation issue."""
        self.validation_issues.append({
            'type': issue_type,
            'message': message,
            **details
        })
        self.validation_passed = False

    def add_semantic_warning(self, warning_type: str, message: str, **details):
        """Add a semantic warning (non-blocking)."""
        self.semantic_warnings.append({
            'type': warning_type,
            'message': message,
            **details
        })

    def fail(self, stage: str, message: str):
        """Mark the run as failed."""
        self.status = 'failed'
        self.error_stage = stage
        self.error_message = message
        self.completed_at = datetime.utcnow()

    def complete(self):
        """Mark the run as completed."""
        self.status = 'completed'
        self.completed_at = datetime.utcnow()

    def to_batch_record(self) -> Dict[str, Any]:
        """
        Convert to dict for etl_batches table insertion.

        Returns dict with keys matching etl_batches columns.
        """
        return {
            'batch_id': self.batch_id,
            'started_at': self.started_at,
            'completed_at': self.completed_at,
            'status': self.status,
            'file_fingerprints': self.file_fingerprints,
            'total_files': self.total_files,
            'schema_version': self.schema_version,
            'rules_version': self.rules_version,
            'contract_hash': self.contract_hash,
            'header_fingerprint': self.header_fingerprint,
            # Source reconciliation
            'source_row_count': self.source_row_count,
            'rows_rejected': self.rows_rejected,
            'rows_skipped': self.rows_skipped,
            # Row counts by stage
            'rows_loaded': self.rows_loaded,
            'rows_after_dedup': self.rows_after_dedup,
            'rows_outliers_marked': self.rows_outliers_marked,
            'rows_promoted': self.rows_promoted,
            'rows_skipped_collision': self.rows_skipped_collision,
            'validation_passed': self.validation_passed,
            'validation_issues': self.validation_issues if self.validation_issues else None,
            'semantic_warnings': self.semantic_warnings if self.semantic_warnings else None,
            'contract_report': self.contract_report if self.contract_report else None,
            'error_message': self.error_message,
            'error_stage': self.error_stage,
            'triggered_by': self.triggered_by,
        }

    def summary(self) -> str:
        """Get human-readable summary of the run."""
        elapsed = (self.completed_at or datetime.utcnow()) - self.started_at
        lines = [
            f"Batch ID: {self.batch_id[:8]}...",
            f"Status: {self.status}",
            f"Schema: {self.schema_version} | Rules: {self.rules_version}",
            f"Files: {self.total_files}",
        ]

        # Source reconciliation
        if self.source_row_count is not None:
            accounted = self.rows_loaded + self.rows_rejected + self.rows_skipped
            unaccounted = self.source_row_count - accounted
            lines.append(
                f"Source: {self.source_row_count} = loaded({self.rows_loaded}) + "
                f"rejected({self.rows_rejected}) + skipped({self.rows_skipped}) "
                f"[unaccounted: {unaccounted}]"
            )
        else:
            lines.append(f"Rows loaded: {self.rows_loaded}")

        lines.extend([
            f"Pipeline: dedup={self.rows_after_dedup}, outliers={self.rows_outliers_marked}, "
            f"promoted={self.rows_promoted}, collisions={self.rows_skipped_collision}",
            f"Elapsed: {elapsed.total_seconds():.1f}s",
        ])

        if self.error_message:
            lines.append(f"Error: {self.error_stage}: {self.error_message}")
        if self.validation_issues:
            lines.append(f"Validation issues: {len(self.validation_issues)}")
        if self.semantic_warnings:
            lines.append(f"Semantic warnings: {len(self.semantic_warnings)}")
        return '\n'.join(lines)

    def reconciliation_check(self) -> tuple:
        """
        Check source reconciliation.

        Returns:
            (is_ok, unaccounted, message)
        """
        if self.source_row_count is None:
            return (None, None, "source_row_count not set")

        accounted = self.rows_loaded + self.rows_rejected + self.rows_skipped
        unaccounted = self.source_row_count - accounted

        if unaccounted == 0:
            return (True, 0, "OK: all rows accounted for")
        else:
            return (False, unaccounted, f"MISMATCH: {unaccounted} rows unaccounted")


def create_run_context(
    run_mode: str = "full",
    triggered_by: str = "manual"
) -> RunContext:
    """
    Factory function to create a new RunContext.

    Args:
        run_mode: One of 'plan', 'stage-only', 'promote', 'full'
        triggered_by: Who/what triggered the run ('manual', 'cron', 'github_action')

    Returns:
        New RunContext instance
    """
    return RunContext(
        run_mode=run_mode,
        triggered_by=triggered_by
    )
