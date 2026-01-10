"""
URA Sync Engine - Orchestrates the full URA API sync workflow

Workflow:
1. Check kill switch (URA_SYNC_ENABLED)
2. Create ura_sync_runs record
3. Refresh URA API token
4. Fetch all batches (1-4)
5. Map to canonical schema
6. Upsert with ON CONFLICT DO UPDATE
7. Run comparison vs baseline
8. Persist comparison results
9. Mark succeeded/failed based on thresholds

Modes:
- dry_run: Fetch and map, but no DB writes
- shadow: Write with source='ura_api', run comparison
- production: Write to prod, still tag source/run_id

Usage:
    # As module
    from services.ura_sync_engine import run_sync
    result = run_sync()  # Returns SyncResult

    # As CLI
    python -m services.ura_sync_engine
    # Exit 0 on success, 1 on failure
"""

import os
import sys
import logging
import uuid
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field, asdict

from sqlalchemy import create_engine, text
from sqlalchemy.orm import scoped_session, sessionmaker

from services.ura_api_client import URAAPIClient, URADataError
from services.ura_canonical_mapper import URACanonicalMapper, NATURAL_KEY_FIELDS
from services.ura_sync_config import (
    is_sync_enabled,
    get_sync_mode,
    get_cutoff_date,
    get_revision_window_months,
    get_revision_window_date,
    validate_sync_config,
    log_sync_config,
    build_upsert_sql,
    SyncStats,
    UPDATABLE_FIELDS,
    INSERT_FIELDS,
)
from services.ura_shadow_comparator import URAShadowComparator, ComparisonReport

logger = logging.getLogger(__name__)


# =============================================================================
# Result Types
# =============================================================================

@dataclass
class SyncResult:
    """Result of a sync run."""
    success: bool
    run_id: Optional[str] = None
    mode: str = 'shadow'
    error_message: Optional[str] = None
    error_stage: Optional[str] = None
    stats: Dict[str, Any] = field(default_factory=dict)
    comparison: Optional[Dict[str, Any]] = None
    duration_seconds: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# =============================================================================
# Database Helpers
# =============================================================================

def get_database_engine():
    """
    Create a database engine from DATABASE_URL.

    Handles:
    - postgres:// → postgresql:// fix for SQLAlchemy 2.0
    - SSL settings for Render/Supabase
    """
    database_url = os.environ.get('DATABASE_URL', '')

    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable not set")

    # Fix postgres:// to postgresql://
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)

    # Determine SSL settings
    connect_args = {}
    if any(host in database_url for host in ['render.com', 'supabase', 'neon', 'pooler']):
        connect_args = {"sslmode": "require"}

    return create_engine(
        database_url,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args=connect_args
    )


def get_git_sha() -> Optional[str]:
    """Get current git SHA for versioning."""
    try:
        import subprocess
        result = subprocess.run(
            ['git', 'rev-parse', '--short', 'HEAD'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None


# =============================================================================
# Sync Engine
# =============================================================================

class URASyncEngine:
    """
    Orchestrates the full URA API sync workflow.

    Example:
        engine = URASyncEngine()
        result = engine.run()
        if not result.success:
            sys.exit(1)
    """

    # Chunk size for batch inserts
    CHUNK_SIZE = 500

    def __init__(
        self,
        mode: Optional[str] = None,
        triggered_by: str = 'manual',
        notes: Optional[str] = None
    ):
        """
        Initialize sync engine.

        Args:
            mode: Override sync mode (shadow/production/dry_run)
            triggered_by: Who triggered this run (cron/manual/backfill/test)
            notes: Optional notes for this run
        """
        self.mode = mode or get_sync_mode()
        self.triggered_by = triggered_by
        self.notes = notes

        self.engine = None
        self.session = None
        self.run_id: Optional[str] = None
        self.stats = SyncStats()
        self.api_response_times: Dict[str, float] = {}
        self.api_retry_counts: Dict[str, int] = {}

    def run(self) -> SyncResult:
        """
        Execute the full sync workflow.

        Returns:
            SyncResult with success/failure status and details
        """
        start_time = datetime.utcnow()

        # Enhanced start logging
        logger.info("=" * 70)
        logger.info("URA SYNC ENGINE - STARTING")
        logger.info("=" * 70)
        logger.info(f"  Mode:        {self.mode}")
        logger.info(f"  Triggered:   {self.triggered_by}")
        logger.info(f"  Start time:  {start_time.isoformat()}")
        logger.info(f"  Git SHA:     {get_git_sha() or 'unknown'}")
        logger.info("=" * 70)

        # 1. Validate configuration
        is_valid, error = validate_sync_config()
        if not is_valid:
            logger.error(f"Sync configuration invalid: {error}")
            return SyncResult(
                success=False,
                error_message=error,
                error_stage='config',
                mode=self.mode
            )

        log_sync_config()

        try:
            # 2. Initialize database connection
            self.engine = get_database_engine()
            Session = scoped_session(sessionmaker(bind=self.engine))
            self.session = Session()

            # 3. Create sync run record
            self.run_id = str(uuid.uuid4())
            self._create_run_record()

            # 4. Execute sync
            try:
                self._execute_sync()

                # 5. Run comparison
                comparison_report = self._run_comparison()

                # 6. Check thresholds
                if comparison_report and not comparison_report.is_acceptable:
                    self._mark_failed(
                        error_message=f"Comparison thresholds exceeded: {comparison_report.issues}",
                        error_stage='compare'
                    )
                    duration = (datetime.utcnow() - start_time).total_seconds()
                    return SyncResult(
                        success=False,
                        run_id=self.run_id,
                        mode=self.mode,
                        error_message=f"Thresholds exceeded: {comparison_report.issues}",
                        error_stage='compare',
                        stats=self.stats.to_dict(),
                        comparison=comparison_report.to_dict() if comparison_report else None,
                        duration_seconds=duration
                    )

                # 7. Mark success
                self._mark_succeeded(comparison_report)

                duration = (datetime.utcnow() - start_time).total_seconds()

                # Enhanced end logging
                logger.info("=" * 70)
                logger.info("URA SYNC ENGINE - COMPLETED SUCCESSFULLY")
                logger.info("=" * 70)
                logger.info(f"  Run ID:      {self.run_id}")
                logger.info(f"  Mode:        {self.mode}")
                logger.info(f"  Duration:    {duration:.1f}s")
                logger.info("  Totals:")
                logger.info(f"    Projects:    {self.stats.raw_projects}")
                logger.info(f"    Transactions:{self.stats.raw_transactions}")
                logger.info(f"    Mapped:      {self.stats.mapped_rows}")
                logger.info(f"    Inserted:    {self.stats.inserted_rows}")
                logger.info(f"    Updated:     {self.stats.updated_rows}")
                logger.info(f"    Unchanged:   {self.stats.unchanged_rows}")
                logger.info(f"    Failed:      {self.stats.failed_rows}")
                if comparison_report:
                    logger.info("  Comparison:")
                    logger.info(f"    Acceptable:  {comparison_report.is_acceptable}")
                    logger.info(f"    Count diff:  {comparison_report.row_count_diff_pct:.1f}%")
                    logger.info(f"    Coverage:    {comparison_report.coverage_pct:.1f}%")
                logger.info("=" * 70)

                return SyncResult(
                    success=True,
                    run_id=self.run_id,
                    mode=self.mode,
                    stats=self.stats.to_dict(),
                    comparison=comparison_report.to_dict() if comparison_report else None,
                    duration_seconds=duration
                )

            except Exception as e:
                logger.exception(f"Sync failed: {e}")
                self._mark_failed(str(e), error_stage='sync')
                duration = (datetime.utcnow() - start_time).total_seconds()

                # Enhanced failure logging
                logger.error("=" * 70)
                logger.error("URA SYNC ENGINE - FAILED")
                logger.error("=" * 70)
                logger.error(f"  Run ID:      {self.run_id}")
                logger.error(f"  Mode:        {self.mode}")
                logger.error(f"  Duration:    {duration:.1f}s")
                logger.error(f"  Error:       {e}")
                logger.error(f"  Stage:       sync")
                logger.error("  Totals (partial):")
                logger.error(f"    Projects:    {self.stats.raw_projects}")
                logger.error(f"    Transactions:{self.stats.raw_transactions}")
                logger.error(f"    Mapped:      {self.stats.mapped_rows}")
                logger.error("=" * 70)

                return SyncResult(
                    success=False,
                    run_id=self.run_id,
                    mode=self.mode,
                    error_message=str(e),
                    error_stage='sync',
                    stats=self.stats.to_dict(),
                    duration_seconds=duration
                )

        except Exception as e:
            logger.exception(f"Sync engine initialization failed: {e}")
            duration = (datetime.utcnow() - start_time).total_seconds()
            return SyncResult(
                success=False,
                mode=self.mode,
                error_message=str(e),
                error_stage='init',
                duration_seconds=duration
            )

        finally:
            self._cleanup()

    def _create_run_record(self):
        """Create the ura_sync_runs record."""
        logger.info(f"Creating sync run: {self.run_id}")

        self.session.execute(text("""
            INSERT INTO ura_sync_runs (
                id, started_at, status, mode,
                revision_window_months, cutoff_date,
                git_sha, triggered_by, notes
            ) VALUES (
                :id, :started_at, 'running', :mode,
                :revision_window, :cutoff_date,
                :git_sha, :triggered_by, :notes
            )
        """), {
            'id': self.run_id,
            'started_at': datetime.utcnow(),
            'mode': self.mode,
            'revision_window': get_revision_window_months(),
            'cutoff_date': get_cutoff_date(),
            'git_sha': get_git_sha(),
            'triggered_by': self.triggered_by,
            'notes': self.notes
        })
        self.session.commit()

    def _execute_sync(self):
        """Execute the fetch → map → upsert workflow."""

        # Initialize API client
        logger.info("Initializing URA API client")
        api_client = URAAPIClient()

        # Initialize mapper
        mapper = URACanonicalMapper(source='ura_api')

        # Get cutoff date
        cutoff_date = get_cutoff_date()
        logger.info(f"Syncing transactions >= {cutoff_date}")

        # Fetch all batches
        all_rows = []
        for batch_num, projects in api_client.fetch_all_transactions():
            logger.info(f"Processing batch {batch_num}: {len(projects)} projects")

            self.stats.raw_projects += len(projects)
            self.stats.raw_transactions += sum(
                len(p.get('transaction', [])) for p in projects
            )

            # Map to canonical schema
            for project in projects:
                for row in mapper.map_project(project):
                    # Apply cutoff filter
                    if row['transaction_date'] >= cutoff_date:
                        all_rows.append(row)

            # Track API metrics
            # Note: Would need to modify API client to expose these
            self._update_batch_progress(batch_num)

        # Get mapper stats
        mapper_stats = mapper.get_stats()
        self.stats.mapped_rows = len(all_rows)
        self.stats.add_mapper_stats(mapper_stats)

        logger.info(
            f"Mapped {len(all_rows)} rows from {self.stats.raw_projects} projects, "
            f"{mapper_stats['transactions_skipped']} skipped"
        )

        # Upsert to database
        if self.mode == 'dry_run':
            logger.info("DRY RUN: Skipping database writes")
            self.stats.inserted_rows = 0
            self.stats.updated_rows = 0
        else:
            self._upsert_rows(all_rows)

    def _upsert_rows(self, rows: List[Dict[str, Any]]):
        """
        Upsert rows to transactions table.

        Uses ON CONFLICT DO UPDATE to handle revisions.
        """
        if not rows:
            logger.info("No rows to upsert")
            return

        logger.info(f"Upserting {len(rows)} rows in chunks of {self.CHUNK_SIZE}")

        inserted = 0
        updated = 0

        # Process in chunks
        for i in range(0, len(rows), self.CHUNK_SIZE):
            chunk = rows[i:i + self.CHUNK_SIZE]
            chunk_inserted, chunk_updated = self._upsert_chunk(chunk)
            inserted += chunk_inserted
            updated += chunk_updated

            if (i + self.CHUNK_SIZE) % 5000 == 0:
                logger.info(f"Progress: {i + len(chunk)}/{len(rows)} rows")

        self.stats.inserted_rows = inserted
        self.stats.updated_rows = updated
        self.stats.unchanged_rows = len(rows) - inserted - updated

        logger.info(f"Upsert complete: {inserted} inserted, {updated} updated")

    def _upsert_chunk(self, rows: List[Dict[str, Any]]) -> Tuple[int, int]:
        """
        Upsert a chunk of rows.

        Returns:
            (inserted_count, updated_count)
        """
        inserted = 0
        updated = 0

        # Build the upsert SQL
        upsert_sql = self._build_upsert_sql()

        for row in rows:
            # Prepare row data with run_id and ingested_at
            row_data = self._prepare_row_for_insert(row)

            try:
                result = self.session.execute(text(upsert_sql), row_data)
                row_result = result.fetchone()

                if row_result:
                    if row_result.was_inserted:
                        inserted += 1
                    else:
                        updated += 1

            except Exception as e:
                logger.warning(f"Failed to upsert row: {e}")
                self.stats.failed_rows += 1

        self.session.commit()
        return inserted, updated

    def _build_upsert_sql(self) -> str:
        """Build the upsert SQL with proper field handling."""

        # Fields to insert
        insert_fields = [
            'project_name', 'transaction_date', 'transaction_month', 'contract_date',
            'price', 'area_sqft', 'psf', 'district', 'bedroom_count',
            'property_type', 'sale_type', 'tenure', 'lease_start_year', 'remaining_lease',
            'street_name', 'floor_range', 'floor_level', 'num_units', 'nett_price',
            'type_of_area', 'market_segment', 'source', 'run_id', 'ingested_at',
            'row_hash', 'raw_extras'
        ]

        # Fields to update on conflict
        update_fields = [
            'price', 'area_sqft', 'psf', 'floor_range', 'sale_type', 'district',
            'nett_price', 'floor_level', 'bedroom_count', 'tenure', 'lease_start_year',
            'remaining_lease', 'num_units', 'type_of_area', 'market_segment',
            'ingested_at', 'run_id'
        ]

        columns = ', '.join(insert_fields)
        values = ', '.join(f':{f}' for f in insert_fields)
        update_set = ', '.join(f'{f} = EXCLUDED.{f}' for f in update_fields)

        return f"""
            INSERT INTO transactions ({columns})
            VALUES ({values})
            ON CONFLICT (row_hash) WHERE row_hash IS NOT NULL
            DO UPDATE SET {update_set}
            RETURNING id, (xmax = 0) as was_inserted
        """

    def _prepare_row_for_insert(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare a row for insertion with run tracking fields."""
        row_data = dict(row)
        row_data['run_id'] = self.run_id
        row_data['ingested_at'] = datetime.utcnow()
        row_data['source'] = 'ura_api'

        # Ensure all required fields have values
        row_data.setdefault('property_type', 'Condominium')
        row_data.setdefault('num_units', 1)

        return row_data

    def _update_batch_progress(self, batch_num: int):
        """Update run record with batch progress."""
        self.session.execute(text("""
            UPDATE ura_sync_runs
            SET current_batch = :batch, batches_completed = :batch
            WHERE id = :run_id
        """), {
            'batch': batch_num,
            'run_id': self.run_id
        })
        self.session.commit()

    def _check_baseline_available(self) -> Tuple[bool, int, str]:
        """
        Check if CSV baseline data exists for comparison.

        Validates:
        1. Minimum row count (1000+)
        2. Freshness: CSV data includes transactions from last 6 months

        Returns:
            Tuple of (is_available, row_count, message)
        """
        cutoff_date = get_cutoff_date()

        # Check count and freshness in one query
        query = text("""
            SELECT
                COUNT(*) as cnt,
                MAX(transaction_month) as latest_month
            FROM transactions
            WHERE source = 'csv'
              AND COALESCE(is_outlier, false) = false
              AND transaction_month >= :cutoff_date
              AND property_type IN ('Condominium', 'Apartment')
        """)

        try:
            result = self.session.execute(query, {'cutoff_date': cutoff_date})
            row = result.fetchone()
            count = row.cnt or 0
            latest_month = row.latest_month

            if count == 0:
                return False, 0, f"No CSV baseline data found for transactions >= {cutoff_date}"

            # Require minimum baseline (at least 1000 rows for meaningful comparison)
            MIN_BASELINE_ROWS = 1000
            if count < MIN_BASELINE_ROWS:
                return False, count, (
                    f"CSV baseline has only {count} rows (minimum {MIN_BASELINE_ROWS} required). "
                    f"Comparison would not be meaningful."
                )

            # Check freshness: latest CSV transaction should be within 6 months
            # This catches stale baselines from paused CSV ingestion
            FRESHNESS_MONTHS = 6
            freshness_threshold = date.today().replace(day=1) - timedelta(days=FRESHNESS_MONTHS * 30)
            if latest_month and latest_month < freshness_threshold:
                return False, count, (
                    f"CSV baseline is stale: latest transaction is {latest_month}, "
                    f"threshold is {freshness_threshold}. CSV ingestion may have paused."
                )

            return True, count, f"CSV baseline available: {count} rows, latest: {latest_month}"

        except Exception as e:
            return False, 0, f"Failed to check baseline: {e}"

    def _run_comparison(self) -> Optional[ComparisonReport]:
        """Run comparison against baseline."""

        if self.mode == 'dry_run':
            logger.info("DRY RUN: Skipping comparison")
            return None

        # Check baseline availability first
        baseline_ok, baseline_count, baseline_msg = self._check_baseline_available()
        if not baseline_ok:
            logger.error(f"BASELINE CHECK FAILED: {baseline_msg}")
            raise RuntimeError(f"Baseline unavailable: {baseline_msg}")

        logger.info(f"Baseline check passed: {baseline_count} CSV rows available")
        logger.info("Running comparison against CSV baseline")

        try:
            comparator = URAShadowComparator(self.engine)

            # Compare this run against CSV data
            # For shadow mode, compare only Condo/Apt to match CSV scope
            report = comparator.compare_run_vs_csv(
                run_id=self.run_id,
                date_range=(get_cutoff_date(), date.today()),
                property_types=['Condominium', 'Apartment']
            )

            logger.info(
                f"Comparison result: acceptable={report.is_acceptable}, "
                f"count_diff={report.row_count_diff_pct:.1f}%, "
                f"coverage={report.coverage_pct:.1f}%"
            )

            if report.issues:
                for issue in report.issues:
                    logger.warning(f"Comparison issue: {issue}")

            # Persist comparison results
            self._persist_comparison(report)

            return report

        except Exception as e:
            logger.exception(f"Comparison failed: {e}")
            # Don't fail the whole sync if comparison fails
            return None

    def _persist_comparison(self, report: ComparisonReport):
        """Persist comparison results to ura_sync_runs."""
        self.session.execute(text("""
            UPDATE ura_sync_runs
            SET comparison_results = :results,
                comparison_baseline_run_id = NULL
            WHERE id = :run_id
        """), {
            'results': report.to_dict(),
            'run_id': self.run_id
        })
        self.session.commit()

    def _mark_succeeded(self, comparison_report: Optional[ComparisonReport] = None):
        """Mark run as succeeded with comparison summary."""
        logger.info("Marking sync run as succeeded")

        # Extract comparison summary for queryable columns
        count_diff_pct = None
        psf_median_diff_pct = None
        coverage_pct = None
        is_acceptable = None
        baseline_row_count = None
        current_row_count = None

        if comparison_report:
            count_diff_pct = comparison_report.row_count_diff_pct
            coverage_pct = comparison_report.coverage_pct
            is_acceptable = comparison_report.is_acceptable
            baseline_row_count = comparison_report.baseline_row_count
            current_row_count = comparison_report.current_row_count

            # Find max PSF median diff across months
            max_psf_diff = 0.0
            for month_data in comparison_report.psf_median_by_month.values():
                diff_pct = month_data.get('diff_pct')
                if diff_pct is not None and abs(diff_pct) > abs(max_psf_diff):
                    max_psf_diff = diff_pct
            psf_median_diff_pct = max_psf_diff if max_psf_diff != 0.0 else None

        self.session.execute(text("""
            UPDATE ura_sync_runs
            SET status = 'succeeded',
                finished_at = :finished_at,
                counters = :counters,
                totals = :totals,
                api_response_times = :api_times,
                api_retry_counts = :api_retries,
                count_diff_pct = :count_diff_pct,
                psf_median_diff_pct = :psf_median_diff_pct,
                coverage_pct = :coverage_pct,
                is_acceptable = :is_acceptable,
                baseline_row_count = :baseline_row_count,
                current_row_count = :current_row_count
            WHERE id = :run_id
        """), {
            'finished_at': datetime.utcnow(),
            'counters': self.stats.skip_counters,
            'totals': self.stats.to_dict(),
            'api_times': self.api_response_times or None,
            'api_retries': self.api_retry_counts or None,
            'count_diff_pct': count_diff_pct,
            'psf_median_diff_pct': psf_median_diff_pct,
            'coverage_pct': coverage_pct,
            'is_acceptable': is_acceptable,
            'baseline_row_count': baseline_row_count,
            'current_row_count': current_row_count,
            'run_id': self.run_id
        })
        self.session.commit()

    def _mark_failed(self, error_message: str, error_stage: str = None):
        """Mark run as failed."""
        logger.error(f"Marking sync run as failed: {error_message}")

        self.session.execute(text("""
            UPDATE ura_sync_runs
            SET status = 'failed',
                finished_at = :finished_at,
                error_message = :error_message,
                error_stage = :error_stage,
                counters = :counters,
                totals = :totals
            WHERE id = :run_id
        """), {
            'finished_at': datetime.utcnow(),
            'error_message': error_message,
            'error_stage': error_stage,
            'counters': self.stats.skip_counters,
            'totals': self.stats.to_dict(),
            'run_id': self.run_id
        })
        self.session.commit()

    def _cleanup(self):
        """Clean up database resources."""
        if self.session:
            try:
                self.session.close()
            except Exception:
                pass

        if self.engine:
            try:
                self.engine.dispose()
            except Exception:
                pass


# =============================================================================
# Module-level convenience function
# =============================================================================

def run_sync(
    mode: Optional[str] = None,
    triggered_by: str = 'manual',
    notes: Optional[str] = None
) -> SyncResult:
    """
    Run a sync with the specified options.

    Args:
        mode: Override sync mode (shadow/production/dry_run)
        triggered_by: Who triggered this run
        notes: Optional notes

    Returns:
        SyncResult
    """
    engine = URASyncEngine(mode=mode, triggered_by=triggered_by, notes=notes)
    return engine.run()


# =============================================================================
# CLI Entry Point
# =============================================================================

def main():
    """
    CLI entry point for cron/manual execution.

    Exit codes:
        0: Success
        1: Failure (thresholds exceeded or error)
        2: Disabled via kill switch
    """
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Reduce noise from libraries
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy').setLevel(logging.WARNING)

    print("=" * 70)
    print("URA Sync Engine - Property Transaction Sync")
    print("=" * 70)

    # Check kill switch first
    if not is_sync_enabled():
        print("\n[DISABLED] Sync is disabled via URA_SYNC_ENABLED=false")
        print("Set URA_SYNC_ENABLED=true to enable sync")
        sys.exit(2)

    # Parse CLI args
    import argparse
    parser = argparse.ArgumentParser(description='URA Sync Engine')
    parser.add_argument(
        '--mode',
        choices=['shadow', 'production', 'dry_run'],
        help='Override sync mode'
    )
    parser.add_argument(
        '--triggered-by',
        default='manual',
        choices=['cron', 'manual', 'backfill', 'test'],
        help='Who triggered this run'
    )
    parser.add_argument(
        '--notes',
        help='Optional notes for this run'
    )
    args = parser.parse_args()

    # Run sync
    result = run_sync(
        mode=args.mode,
        triggered_by=args.triggered_by,
        notes=args.notes
    )

    # Print summary
    print("\n" + "=" * 70)
    print("SYNC RESULT")
    print("=" * 70)
    print(f"  Status:     {'SUCCESS' if result.success else 'FAILED'}")
    print(f"  Run ID:     {result.run_id}")
    print(f"  Mode:       {result.mode}")
    print(f"  Duration:   {result.duration_seconds:.1f}s")

    if result.stats:
        print(f"\n  Stats:")
        print(f"    Raw projects:      {result.stats.get('raw_projects', 0)}")
        print(f"    Raw transactions:  {result.stats.get('raw_transactions', 0)}")
        print(f"    Mapped rows:       {result.stats.get('mapped_rows', 0)}")
        print(f"    Inserted:          {result.stats.get('inserted_rows', 0)}")
        print(f"    Updated:           {result.stats.get('updated_rows', 0)}")

    if result.comparison:
        print(f"\n  Comparison:")
        print(f"    Acceptable:        {result.comparison.get('is_acceptable', False)}")
        print(f"    Row count diff:    {result.comparison.get('row_count_diff_pct', 0):.1f}%")
        print(f"    Coverage:          {result.comparison.get('coverage_pct', 0):.1f}%")
        if result.comparison.get('issues'):
            print(f"    Issues:")
            for issue in result.comparison['issues']:
                print(f"      - {issue}")

    if result.error_message:
        print(f"\n  Error: {result.error_message}")
        print(f"  Stage: {result.error_stage}")

    print("=" * 70)

    # Exit with appropriate code
    if result.success:
        print("\n[SUCCESS] Sync completed successfully")
        sys.exit(0)
    else:
        print("\n[FAILED] Sync failed - check logs above")
        sys.exit(1)


if __name__ == '__main__':
    main()
