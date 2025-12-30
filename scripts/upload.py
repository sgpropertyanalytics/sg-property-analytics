"""
Upload Script - Production-Grade Data Upload with Zero Downtime

Architecture: Staging → Validate → Atomic Publish
- Loads CSV data into transactions_staging (isolated from production)
- Runs validations on staging data
- Atomically swaps staging → production via table rename
- Keeps previous version for 24h rollback safety

Memory-efficient design for 512MB Render limit:
1. Process one CSV at a time, save to staging, clear memory
2. Deduplicate using SQL after all data loaded
3. Remove outliers using SQL-based IQR calculation

Usage:
    python -m scripts.upload                    # Staging + publish (default)
    python -m scripts.upload --staging-only     # Load to staging, don't publish
    python -m scripts.upload --publish          # Publish existing staging to prod
    python -m scripts.upload --rollback         # Rollback to previous version
    python -m scripts.upload --check            # Schema parity check only
    python -m scripts.upload --dry-run          # Preview without changes
    python -m scripts.upload --plan             # Load to staging, show diff, don't promote

CRITICAL: This script preserves ALL CSV columns end-to-end.
"""

import sys
import os
import gc
import re
import argparse
import uuid
import json
import time
from datetime import datetime
from typing import Set, List, Tuple, Dict, Any, Optional

from flask import Flask
from sqlalchemy import text, inspect
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from urllib.parse import urlparse
from config import Config
from models.database import db
from models.transaction import Transaction
from services.data_loader import clean_csv_data, parse_date_flexible
from services.data_computation import recompute_all_stats
import pandas as pd

# Contract-based header resolution (Step A of incremental migration)
try:
    from contracts import (
        load_transaction_schema,
        get_schema_version,
        get_contract_hash,
        check_contract_compatibility,
        compute_header_fingerprint,
        get_natural_key_fields,
    )
    CONTRACT_AVAILABLE = True
except ImportError:
    CONTRACT_AVAILABLE = False

# RunContext for batch tracking (Step B of incremental migration)
try:
    from services.etl.run_context import RunContext, create_run_context
    from services.etl.rule_registry import get_rule_registry
    from services.etl.fingerprint import compute_file_sha256, compute_row_hash
    RUN_CONTEXT_AVAILABLE = True
except ImportError:
    RUN_CONTEXT_AVAILABLE = False

# Row hash computation (Step C of incremental migration)
# Natural key fields for deduplication
NATURAL_KEY_FIELDS = ['project_name', 'transaction_month', 'price', 'area_sqft', 'floor_range']


def compute_transaction_row_hash(row: dict) -> str:
    """
    Compute row_hash for a transaction record using natural key fields.

    Step C: Just compute and store, don't enforce uniqueness yet.

    The natural key is: project_name, transaction_month, price, area_sqft, floor_range
    where transaction_month is the first day of the transaction month.
    """
    if not RUN_CONTEXT_AVAILABLE:
        return None

    # Build the natural key dict
    natural_key = {}

    # project_name
    natural_key['project_name'] = row.get('project_name', '')

    # transaction_month: first day of the month
    transaction_date = row.get('transaction_date')
    if transaction_date:
        if hasattr(transaction_date, 'replace'):
            # datetime or date object
            natural_key['transaction_month'] = transaction_date.replace(day=1)
        else:
            natural_key['transaction_month'] = None
    else:
        natural_key['transaction_month'] = None

    # price and area_sqft
    natural_key['price'] = row.get('price', 0)
    natural_key['area_sqft'] = row.get('area_sqft', 0)

    # floor_range
    natural_key['floor_range'] = row.get('floor_range', '')

    try:
        return compute_row_hash(natural_key, NATURAL_KEY_FIELDS)
    except Exception:
        return None

# =============================================================================
# ETL FEATURES (production defaults)
# =============================================================================


def preflight_db_check(app) -> bool:
    """
    Preflight database connectivity check with clear error messages.

    Returns True if connection successful, exits with error otherwise.
    """
    # Print connection info (redact password)
    db_url = app.config.get('SQLALCHEMY_DATABASE_URI', '')
    parsed = urlparse(db_url)
    safe_url = f"{parsed.scheme}://{parsed.username}:****@{parsed.hostname}:{parsed.port or 5432}{parsed.path}"
    print(f"\n🔗 Database URL: {safe_url}")

    try:
        with app.app_context():
            # Simple connectivity test
            result = db.session.execute(text("SELECT 1")).scalar()
            if result != 1:
                raise RuntimeError("SELECT 1 did not return expected result")

            # Get database info
            db_info = db.session.execute(text(
                "SELECT current_database(), current_user, version()"
            )).fetchone()

            print(f"✅ Database connection successful!")
            print(f"   Database: {db_info[0]}")
            print(f"   User: {db_info[1]}")
            print(f"   PostgreSQL: {db_info[2].split(',')[0]}")

            # Check if transactions table exists
            table_exists = db.session.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'transactions'
                )
            """)).scalar()
            if table_exists:
                count = db.session.execute(text("SELECT COUNT(*) FROM transactions")).scalar()
                print(f"   Existing records: {count:,}")
            else:
                print(f"   Transactions table: (will be created)")

            return True

    except OperationalError as e:
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        print(f"\n❌ DATABASE CONNECTION FAILED")
        print(f"=" * 60)

        if 'SSL' in error_msg.upper() or 'ssl' in error_msg:
            print(f"Error: SSL/TLS connection required but not configured")
            print(f"\nFix: Add ?sslmode=require to your DATABASE_URL")
            print(f"Example: postgresql://user:pass@host:5432/db?sslmode=require")
        elif 'authentication failed' in error_msg.lower() or 'password' in error_msg.lower():
            print(f"Error: Authentication failed - check username/password")
            print(f"\nVerify DATABASE_URL credentials are correct")
        elif 'could not connect' in error_msg.lower() or 'connection refused' in error_msg.lower():
            print(f"Error: Cannot reach database server")
            print(f"\nPossible causes:")
            print(f"  - Database server not running")
            print(f"  - Wrong host/port in DATABASE_URL")
            print(f"  - Firewall blocking connection")
            print(f"  - Using internal URL instead of external URL (Render)")
        elif 'timeout' in error_msg.lower():
            print(f"Error: Connection timeout")
            print(f"\nPossible causes:")
            print(f"  - Database server overloaded")
            print(f"  - Network issues")
            print(f"  - Wrong host (internal vs external URL)")
        else:
            print(f"Error: {error_msg}")

        print(f"\nDATABASE_URL format: postgresql://user:pass@host:port/database")
        print(f"=" * 60)
        sys.exit(1)

    except SQLAlchemyError as e:
        print(f"\n❌ DATABASE ERROR: {e}")
        sys.exit(1)

    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


# === Constants ===
ADVISORY_LOCK_ID = 12345  # Unique lock ID for upload process
STAGING_TABLE = 'transactions_staging'
PRODUCTION_TABLE = 'transactions'
PREVIOUS_TABLE = 'transactions_prev'

EXPECTED_CSV_COLUMNS = {
    'Project Name', 'Street Name', 'Property Type', 'Postal District',
    'Market Segment', 'Tenure', 'Type of Sale', 'Number of Units',
    'Nett Price($)', 'Transacted Price ($)', 'Area (SQFT)',
    'Type of Area', 'Unit Price ($ PSF)', 'Sale Date', 'Floor Level',
}

CSV_TO_DB_MAPPING = {
    'Project Name': 'project_name',
    'Street Name': 'street_name',
    'Property Type': 'property_type',
    'Postal District': 'district',
    'Market Segment': 'market_segment',
    'Tenure': 'tenure',
    'Type of Sale': 'sale_type',
    'Number of Units': 'num_units',
    'Nett Price($)': 'nett_price',
    'Transacted Price ($)': 'price',
    'Area (SQFT)': 'area_sqft',
    'Type of Area': 'type_of_area',
    'Unit Price ($ PSF)': 'psf',
    'Sale Date': 'transaction_date',
    'Floor Level': 'floor_range',  # CSV column "Floor Level" maps to DB column "floor_range"
}

# Validation thresholds
VALIDATION_CONFIG = {
    'min_row_count': 1000,  # Minimum rows expected
    'max_null_rate': {
        'project_name': 0.0,  # 0% nulls allowed
        'price': 0.0,
        'area_sqft': 0.0,
        'district': 0.01,  # 1% nulls allowed
        'transaction_date': 0.0,
    },
    'price_range': (50_000, 100_000_000),  # $50K - $100M
    'psf_range': (100, 20_000),  # $100 - $20K PSF
    'area_range': (100, 50_000),  # 100 - 50,000 sqft
}


# =============================================================================
# CONTRACT-BASED HEADER RESOLUTION (Step A)
# =============================================================================

def check_csv_headers_against_contract(csv_path: str, logger: 'UploadLogger' = None) -> Dict[str, Any]:
    """
    Check CSV headers against schema contract before loading.

    This is a non-blocking check that reports:
    - Missing required columns (will fail later if critical)
    - Missing optional columns (info only)
    - Unknown columns (stored in raw_extras)
    - Aliases used (info only)

    Args:
        csv_path: Path to CSV file
        logger: Optional logger for output

    Returns:
        Contract compatibility report dict
    """
    if not CONTRACT_AVAILABLE:
        return {'skipped': True, 'reason': 'Contract not available'}

    try:
        # Read only the header row
        df_header = pd.read_csv(csv_path, nrows=0)
        csv_headers = list(df_header.columns)

        # Check against contract
        report = check_contract_compatibility(csv_headers)
        header_fp = compute_header_fingerprint(csv_headers)

        report['header_fingerprint'] = header_fp
        report['schema_version'] = get_schema_version()
        report['contract_hash'] = get_contract_hash()

        # Log results
        if logger:
            if report['missing_required']:
                logger.log(f"  ⚠️  Missing required columns: {report['missing_required']}")
            if report['aliases_used']:
                logger.log(f"  ℹ️  Aliases used: {report['aliases_used']}")
            if report['unknown_headers']:
                logger.log(f"  ℹ️  Unknown columns (will store in raw_extras): {report['unknown_headers'][:5]}")
                if len(report['unknown_headers']) > 5:
                    logger.log(f"      ... and {len(report['unknown_headers']) - 5} more")
            if report['is_valid']:
                logger.log(f"  ✓ Contract check passed (schema v{report['schema_version']})")

        return report

    except Exception as e:
        if logger:
            logger.log(f"  ⚠️  Contract check failed: {e}")
        return {'skipped': True, 'error': str(e)}


def run_contract_preflight(csv_files: List[str], logger: 'UploadLogger') -> Tuple[bool, Dict[str, Any]]:
    """
    Run contract compatibility check on all CSV files before loading.

    This is Step A of the incremental migration: check headers without
    changing the actual loading behavior.

    Args:
        csv_files: List of CSV file paths
        logger: Logger instance

    Returns:
        (all_valid, combined_report)
    """
    if not CONTRACT_AVAILABLE:
        logger.log("Contract-based header check: SKIPPED (not available)")
        return True, {}

    logger.log("Running contract-based header check...")
    logger.log(f"  Schema version: {get_schema_version()}")
    logger.log(f"  Contract hash: {get_contract_hash()}")

    all_valid = True
    combined_report = {
        'schema_version': get_schema_version(),
        'contract_hash': get_contract_hash(),
        'files': {},
        'all_missing_required': set(),
        'all_unknown_headers': set(),
        'all_aliases_used': {},
    }

    for csv_path in csv_files:
        filename = os.path.basename(csv_path)
        logger.log(f"  Checking: {filename}")
        report = check_csv_headers_against_contract(csv_path, logger)

        combined_report['files'][filename] = report

        if not report.get('skipped'):
            if report.get('missing_required'):
                combined_report['all_missing_required'].update(report['missing_required'])
            if report.get('unknown_headers'):
                combined_report['all_unknown_headers'].update(report['unknown_headers'])
            if report.get('aliases_used'):
                combined_report['all_aliases_used'].update(report['aliases_used'])
            if not report.get('is_valid', True):
                all_valid = False

    # Convert sets to lists for JSON serialization
    combined_report['all_missing_required'] = list(combined_report['all_missing_required'])
    combined_report['all_unknown_headers'] = list(combined_report['all_unknown_headers'])

    if all_valid:
        logger.log("✅ Contract preflight check passed")
    else:
        logger.log("⚠️  Contract preflight check found issues (continuing with existing logic)")

    return all_valid, combined_report


# =============================================================================
# BATCH TRACKING (Step B)
# =============================================================================

def ensure_etl_batches_table():
    """
    Ensure etl_batches table exists (in case migration hasn't run).

    This is a safety fallback - the proper way is to run the migration.
    """
    if not RUN_CONTEXT_AVAILABLE:
        return

    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS etl_batches (
            id SERIAL PRIMARY KEY,
            batch_id UUID NOT NULL UNIQUE,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMPTZ,
            status VARCHAR(20) NOT NULL DEFAULT 'staging',
            file_fingerprints JSONB,
            total_files INTEGER DEFAULT 0,
            schema_version VARCHAR(20),
            rules_version VARCHAR(40),
            contract_hash VARCHAR(32),
            header_fingerprint VARCHAR(64),
            -- Source reconciliation columns
            source_row_count INTEGER,
            rows_rejected INTEGER NOT NULL DEFAULT 0,
            rows_skipped INTEGER NOT NULL DEFAULT 0,
            -- Row counts by stage
            rows_loaded INTEGER DEFAULT 0,
            rows_after_dedup INTEGER DEFAULT 0,
            rows_outliers_marked INTEGER DEFAULT 0,
            rows_promoted INTEGER DEFAULT 0,
            rows_skipped_collision INTEGER DEFAULT 0,
            validation_passed BOOLEAN,
            validation_issues JSONB,
            semantic_warnings JSONB,
            contract_report JSONB,
            error_message TEXT,
            error_stage VARCHAR(50),
            triggered_by VARCHAR(100) DEFAULT 'manual'
        )
    """))
    db.session.commit()


def insert_batch_record(ctx: 'RunContext', logger: 'UploadLogger') -> bool:
    """
    Insert initial batch record into etl_batches table.

    Returns True if successful.
    """
    if not RUN_CONTEXT_AVAILABLE:
        return False

    try:
        record = ctx.to_batch_record()
        db.session.execute(text("""
            INSERT INTO etl_batches (
                batch_id, started_at, status, schema_version, rules_version,
                contract_hash, header_fingerprint, file_fingerprints, total_files,
                triggered_by
            ) VALUES (
                :batch_id, :started_at, :status, :schema_version, :rules_version,
                :contract_hash, :header_fingerprint, :file_fingerprints, :total_files,
                :triggered_by
            )
        """), {
            'batch_id': record['batch_id'],
            'started_at': record['started_at'],
            'status': record['status'],
            'schema_version': record['schema_version'],
            'rules_version': record['rules_version'],
            'contract_hash': record['contract_hash'],
            'header_fingerprint': record['header_fingerprint'],
            'file_fingerprints': json.dumps(record['file_fingerprints']) if record['file_fingerprints'] else None,
            'total_files': record['total_files'],
            'triggered_by': record['triggered_by'],
        })
        db.session.commit()
        logger.log(f"  ✓ Batch record created: {ctx.batch_id[:8]}...")
        return True
    except Exception as e:
        logger.log(f"  ⚠️  Failed to create batch record: {e}")
        db.session.rollback()
        return False


def update_batch_record(ctx: 'RunContext', logger: 'UploadLogger') -> bool:
    """
    Update batch record with current context state.

    Call this after each stage completes.
    """
    if not RUN_CONTEXT_AVAILABLE:
        return False

    try:
        record = ctx.to_batch_record()
        db.session.execute(text("""
            UPDATE etl_batches SET
                status = :status,
                completed_at = :completed_at,
                -- Source reconciliation
                source_row_count = :source_row_count,
                rows_rejected = :rows_rejected,
                rows_skipped = :rows_skipped,
                -- Row counts by stage
                rows_loaded = :rows_loaded,
                rows_after_dedup = :rows_after_dedup,
                rows_outliers_marked = :rows_outliers_marked,
                rows_promoted = :rows_promoted,
                rows_skipped_collision = :rows_skipped_collision,
                validation_passed = :validation_passed,
                validation_issues = :validation_issues,
                semantic_warnings = :semantic_warnings,
                contract_report = :contract_report,
                error_message = :error_message,
                error_stage = :error_stage
            WHERE batch_id = :batch_id
        """), {
            'batch_id': record['batch_id'],
            'status': record['status'],
            'completed_at': record['completed_at'],
            # Source reconciliation
            'source_row_count': record['source_row_count'],
            'rows_rejected': record['rows_rejected'],
            'rows_skipped': record['rows_skipped'],
            # Row counts by stage
            'rows_loaded': record['rows_loaded'],
            'rows_after_dedup': record['rows_after_dedup'],
            'rows_outliers_marked': record['rows_outliers_marked'],
            'rows_promoted': record['rows_promoted'],
            'rows_skipped_collision': record['rows_skipped_collision'],
            'validation_passed': record['validation_passed'],
            'validation_issues': json.dumps(record['validation_issues']) if record['validation_issues'] else None,
            'semantic_warnings': json.dumps(record['semantic_warnings']) if record['semantic_warnings'] else None,
            'contract_report': json.dumps(record['contract_report']) if record['contract_report'] else None,
            'error_message': record['error_message'],
            'error_stage': record['error_stage'],
        })
        db.session.commit()
        return True
    except Exception as e:
        logger.log(f"  ⚠️  Failed to update batch record: {e}")
        db.session.rollback()
        return False


def initialize_run_context(
    csv_files: list,
    contract_report: dict = None,
    logger: 'UploadLogger' = None
) -> 'RunContext':
    """
    Initialize RunContext with file fingerprints and version info.

    This is Step B: audit tracking only, no behavior change.
    """
    if not RUN_CONTEXT_AVAILABLE:
        return None

    ctx = create_run_context(run_mode='full', triggered_by='manual')

    # Set schema/rules versions
    if CONTRACT_AVAILABLE:
        ctx.schema_version = get_schema_version()
        ctx.contract_hash = get_contract_hash()
    else:
        ctx.schema_version = 'unknown'
        ctx.contract_hash = 'unknown'

    try:
        registry = get_rule_registry()
        ctx.rules_version = registry.get_version()
    except Exception:
        ctx.rules_version = 'unknown'

    # Compute file fingerprints
    for csv_path in csv_files:
        try:
            fingerprint = compute_file_sha256(csv_path)
            ctx.file_fingerprints[os.path.basename(csv_path)] = fingerprint
        except Exception as e:
            if logger:
                logger.log(f"  ⚠️  Could not fingerprint {csv_path}: {e}")

    ctx.total_files = len(csv_files)

    # Store contract report if available
    if contract_report:
        ctx.contract_report = contract_report
        ctx.header_fingerprint = contract_report.get('files', {}).get(
            list(contract_report.get('files', {}).keys())[0] if contract_report.get('files') else '',
            {}
        ).get('header_fingerprint', '')

    return ctx


# =============================================================================
# LOGGING & OBSERVABILITY
# =============================================================================

class UploadLogger:
    """Structured logging for upload process."""

    def __init__(self, run_id: str):
        self.run_id = run_id
        self.start_time = datetime.utcnow()
        self.stages: List[Dict] = []
        self.current_stage: Optional[str] = None

    def stage(self, name: str):
        """Start a new stage."""
        if self.current_stage:
            self._end_stage()
        self.current_stage = name
        self._stage_start = datetime.utcnow()
        print(f"\n{'='*60}")
        print(f"[{self.run_id[:8]}] STAGE: {name}")
        print(f"{'='*60}")

    def _end_stage(self):
        """End current stage."""
        if self.current_stage:
            elapsed = (datetime.utcnow() - self._stage_start).total_seconds()
            self.stages.append({
                'name': self.current_stage,
                'elapsed_seconds': elapsed,
                'timestamp': self._stage_start.isoformat()
            })

    def log(self, message: str, data: Dict = None):
        """Log a message with optional data."""
        prefix = f"[{self.run_id[:8]}]"
        print(f"{prefix} {message}")
        if data:
            for k, v in data.items():
                print(f"{prefix}   {k}: {v}")

    def summary(self) -> Dict:
        """Get summary of the run."""
        self._end_stage()
        total_elapsed = (datetime.utcnow() - self.start_time).total_seconds()
        return {
            'run_id': self.run_id,
            'start_time': self.start_time.isoformat(),
            'total_elapsed_seconds': total_elapsed,
            'stages': self.stages
        }


# =============================================================================
# TIMESTAMPED LOGGING HELPER
# =============================================================================

def log_step(logger, msg):
    """Log with timestamp for diagnosing hangs."""
    logger.log(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {msg}")


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def create_app():
    """Create Flask app for database access."""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def get_db_columns() -> Set[str]:
    """Get all column names from the Transaction model."""
    mapper = inspect(Transaction)
    return {column.key for column in mapper.columns}


def find_sample_csv(rawdata_path: str) -> Optional[str]:
    """Find a sample CSV file from rawdata folder."""
    for folder in ['New Sale', 'Resale', 'Subsale']:
        folder_path = os.path.join(rawdata_path, folder)
        if os.path.exists(folder_path):
            for f in os.listdir(folder_path):
                if f.endswith('.csv'):
                    return os.path.join(folder_path, f)
    return None


def _safe_str(value, default='') -> str:
    """Safely convert a value to string, handling NaN/None/'None'/'nan'."""
    if pd.isna(value) or value is None:
        return default
    s = str(value).strip()
    # Normalize various null representations to empty
    if s.lower() in ('nan', 'none', 'null', '<na>', 'nat'):
        return default
    return s


def _safe_float(value, default=0.0, warn_on_coerce=False, field_name=None) -> float:
    """Safely convert a value to float, handling NaN/None.

    Issue B15: Added optional warning for silent type coercion.
    """
    if pd.isna(value) or value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        if warn_on_coerce and field_name:
            print(f"  ⚠️  Could not convert {field_name}='{value}' to float, using default={default}")
        return default


def _safe_int(value, default=None, warn_on_coerce=False, field_name=None):
    """Safely convert a value to int, handling NaN/None.

    Issue B15: Added optional warning for silent type coercion.
    """
    if pd.isna(value) or value is None:
        return default
    try:
        return int(float(value))
    except (ValueError, TypeError):
        if warn_on_coerce and field_name:
            print(f"  ⚠️  Could not convert {field_name}='{value}' to int, using default={default}")
        return default


def _parse_lease_info(tenure_str: str, current_year: int):
    """Parse lease start year and remaining lease from tenure string.

    Issue B14: Handle different lease durations (99, 999, etc.) instead of
    assuming all leases are 99 years.
    """
    if not tenure_str or tenure_str == 'nan':
        return None, None

    tenure_str = str(tenure_str)

    if "freehold" in tenure_str.lower() or "estate in perpetuity" in tenure_str.lower():
        return None, 999

    lease_start_year = None
    remaining_lease = None

    # B14: Detect lease duration from tenure string (e.g., "999 years", "99 years")
    lease_duration = 99  # Default to 99 years
    duration_match = re.search(r"(\d+)\s*(?:year|yr)s?", tenure_str.lower())
    if duration_match:
        detected_duration = int(duration_match.group(1))
        if detected_duration in [99, 999, 103, 110]:  # Common lease durations in Singapore
            lease_duration = detected_duration

    match = re.search(r"(?:from|commencing)\s+(\d{4})", tenure_str.lower())
    if match:
        try:
            year = int(match.group(1))
            lease_start_year = year
            remaining_lease = lease_duration - (current_year - year)
            if remaining_lease < 0:
                remaining_lease = 0
        except ValueError:
            pass

    if lease_start_year is None:
        fallback = re.search(r"(\d{4})", tenure_str)
        if fallback:
            try:
                year = int(fallback.group(1))
                lease_start_year = year
                remaining_lease = lease_duration - (current_year - year)
                if remaining_lease < 0:
                    remaining_lease = 0
            except ValueError:
                pass

    return lease_start_year, remaining_lease


# =============================================================================
# STEP G: PSF RECONCILIATION + RAW EXTRAS
# =============================================================================

# PSF tolerance settings (from schema contract)
PSF_TOLERANCE_ABSOLUTE = 3.0   # ±$3 PSF
PSF_TOLERANCE_PERCENT = 0.005  # ±0.5%


def reconcile_psf(psf_source: float, psf_calc: float) -> Tuple[float, bool, str]:
    """
    Reconcile PSF from source (CSV) vs calculated (price/area).

    Step G: PSF reconciliation with tolerance-based validation.

    Logic:
    - If psf_source is within tolerance of psf_calc → use psf_source
    - Otherwise → use psf_calc and flag as mismatch

    Args:
        psf_source: PSF from CSV (Unit Price $ PSF column)
        psf_calc: Computed PSF (price / area_sqft)

    Returns:
        Tuple of (canonical_psf, is_match, warning_message)
        - canonical_psf: The PSF value to use
        - is_match: True if source matches calc within tolerance
        - warning_message: Empty if match, else description of mismatch
    """
    # Handle edge cases
    if not psf_source or psf_source <= 0:
        return psf_calc, True, ''  # No source, use calculated

    if not psf_calc or psf_calc <= 0:
        return psf_source, True, ''  # Can't calculate, use source

    # Check tolerance
    abs_diff = abs(psf_source - psf_calc)
    pct_diff = abs_diff / psf_calc if psf_calc > 0 else 1.0

    is_within_tolerance = (
        abs_diff <= PSF_TOLERANCE_ABSOLUTE or
        pct_diff <= PSF_TOLERANCE_PERCENT
    )

    if is_within_tolerance:
        # Source is within tolerance - use source
        return psf_source, True, ''
    else:
        # Mismatch - use calculated and warn
        warning = f"PSF mismatch: source={psf_source:.2f}, calc={psf_calc:.2f}, diff={abs_diff:.2f} ({pct_diff*100:.1f}%)"
        return psf_calc, False, warning


def compute_psf_with_reconciliation(price: float, area_sqft: float, psf_source: float) -> Dict[str, Any]:
    """
    Compute PSF values with full reconciliation data.

    Step G: Returns all PSF fields for storage.

    Args:
        price: Transaction price
        area_sqft: Area in square feet
        psf_source: PSF from CSV (may be None or 0)

    Returns:
        Dict with psf_source, psf_calc, psf (canonical), and any warnings
    """
    result = {
        'psf_source': psf_source if psf_source and psf_source > 0 else None,
        'psf_calc': None,
        'psf': None,
        'psf_mismatch': False,
        'psf_warning': None,
    }

    # Compute PSF from price and area
    if price and price > 0 and area_sqft and area_sqft > 0:
        result['psf_calc'] = round(price / area_sqft, 2)

    # Reconcile
    psf_src = result['psf_source'] or 0
    psf_calc = result['psf_calc'] or 0

    if psf_src > 0 and psf_calc > 0:
        canonical_psf, is_match, warning = reconcile_psf(psf_src, psf_calc)
        result['psf'] = canonical_psf
        result['psf_mismatch'] = not is_match
        result['psf_warning'] = warning if warning else None
    elif psf_calc > 0:
        result['psf'] = psf_calc
    elif psf_src > 0:
        result['psf'] = psf_src
    else:
        result['psf'] = None

    return result


def extract_raw_extras(row: Dict[str, Any], known_fields: Set[str]) -> Optional[Dict[str, Any]]:
    """
    Extract unknown columns into raw_extras JSONB.

    Step G: Store unknown CSV columns for audit and future compatibility.

    Args:
        row: Full row dict with all columns
        known_fields: Set of canonical field names we recognize

    Returns:
        Dict of unknown fields, or None if all fields are known
    """
    extras = {}
    for key, value in row.items():
        if key not in known_fields and value is not None:
            # Convert to JSON-safe types
            if pd.notna(value):
                if hasattr(value, 'isoformat'):
                    extras[key] = value.isoformat()
                elif isinstance(value, (int, float, str, bool)):
                    extras[key] = value
                else:
                    extras[key] = str(value)

    return extras if extras else None


# Known field names (canonical) - used for raw_extras extraction
KNOWN_FIELDS = {
    'project_name', 'Project Name',
    'transaction_date', 'Sale Date', 'Transaction Date',
    'contract_date', 'Contract Date',
    'price', 'Transacted Price ($)', 'Transacted Price',
    'area_sqft', 'Area (SQFT)', 'Area (Sqft)',
    'psf', 'Unit Price ($ PSF)', 'Unit Price (PSF)',
    'district', 'Postal District', 'District',
    'bedroom_count',
    'property_type', 'Property Type',
    'sale_type', 'Type of Sale', 'Sale Type',
    'tenure', 'Tenure', 'Lease',
    'lease_start_year',
    'remaining_lease',
    'street_name', 'Street Name', 'Address',
    'floor_range', 'Floor Level', 'Floor Range',
    'floor_level',
    'num_units', 'Number of Units', 'Units',
    'nett_price', 'Nett Price($)', 'Nett Price',
    'type_of_area', 'Type of Area',
    'market_segment', 'Market Segment',
    'area_sqm', 'Area (SQM)',
}


def _execute_with_retry(session, sql, values, logger, batch_num: int, max_retries: int = 3) -> Tuple[bool, int]:
    """
    Execute SQL INSERT with retry logic and exponential backoff.

    Args:
        session: SQLAlchemy session
        sql: SQL statement to execute
        values: List of value dicts for the INSERT
        logger: UploadLogger instance
        batch_num: Batch number for logging
        max_retries: Maximum number of retry attempts

    Returns:
        Tuple of (success: bool, rows_inserted: int)
    """
    for attempt in range(max_retries):
        try:
            session.execute(sql, values)
            session.commit()
            return True, len(values)

        except OperationalError as e:
            session.rollback()
            error_msg = str(e)

            # Check if it's a recoverable timeout/connection error
            is_timeout = any(err in error_msg.lower() for err in [
                'timeout', 'timed out', 'connection reset', 'ssl syscall',
                'could not receive data', 'server closed the connection',
                'connection refused', 'broken pipe'
            ])

            if is_timeout and attempt < max_retries - 1:
                wait_time = 2 ** attempt  # 1s, 2s, 4s exponential backoff
                logger.log(f"  ⚠️  Batch {batch_num} timeout (attempt {attempt + 1}/{max_retries}), "
                          f"retrying in {wait_time}s...")

                time.sleep(wait_time)

                # Force session refresh - dispose old connection and get fresh one
                try:
                    session.rollback()  # Clear any poisoned transaction state
                except Exception:
                    pass
                try:
                    session.close()
                    # The next execute will get a fresh connection from the pool
                except Exception:
                    pass  # Connection may already be dead

                continue  # Retry

            else:
                # Non-timeout error or final attempt
                logger.log(f"  ❌ Batch {batch_num} failed after {attempt + 1} attempts: "
                          f"{error_msg[:150]}")
                return False, 0

        except SQLAlchemyError as e:
            session.rollback()
            logger.log(f"  ❌ Batch {batch_num} SQL error: {str(e)[:150]}")
            return False, 0

    return False, 0


# =============================================================================
# ADVISORY LOCK FOR CONCURRENCY SAFETY
# =============================================================================

def acquire_advisory_lock() -> bool:
    """
    Acquire PostgreSQL advisory lock to prevent concurrent uploads.
    Returns True if lock acquired, False if another upload is running.
    """
    result = db.session.execute(
        text(f"SELECT pg_try_advisory_lock({ADVISORY_LOCK_ID})")
    ).scalar()
    return bool(result)


def release_advisory_lock():
    """Release the advisory lock."""
    db.session.execute(text(f"SELECT pg_advisory_unlock({ADVISORY_LOCK_ID})"))


# =============================================================================
# STAGING TABLE MANAGEMENT
# =============================================================================

def create_staging_table(logger: UploadLogger, batch_id: str = None):
    """
    Create or ensure staging table exists.

    Step D: Batch-scoped staging - table is append-only, not DROP/CREATE.
    We keep existing data and filter by batch_id for all operations.
    """
    logger.log("Ensuring staging table exists (batch-scoped mode)...")

    # Check if table exists
    table_exists = db.session.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = :table_name
        )
    """), {'table_name': STAGING_TABLE}).scalar()

    if not table_exists:
        logger.log("  Creating staging table...")
        _create_staging_table_schema(logger)
    else:
        logger.log("  ✓ Staging table exists, checking schema...")
        # Migrate schema if needed (add missing columns)
        _migrate_staging_schema(logger)
        logger.log(f"  ✓ Schema OK, will append with batch_id={batch_id[:8]}...")


def _migrate_staging_schema(logger: UploadLogger):
    """
    Add missing columns to existing staging table, or recreate if schema differs too much.

    This allows schema evolution without dropping existing data.
    """
    # Define all expected columns with their types (complete list)
    expected_columns = {
        'contract_date': 'VARCHAR(10)',
        'psf_source': 'FLOAT',
        'psf_calc': 'FLOAT',
        'property_type': "TEXT DEFAULT 'Condominium'",
        'sale_type': 'VARCHAR(50)',
        'tenure': 'TEXT',
        'lease_start_year': 'INTEGER',
        'remaining_lease': 'INTEGER',
        'street_name': 'TEXT',
        'floor_range': 'TEXT',
        'floor_level': 'TEXT',
        'num_units': 'INTEGER',
        'nett_price': 'FLOAT',
        'type_of_area': 'TEXT',
        'market_segment': 'TEXT',
        'market_segment_raw': 'TEXT',
        'is_outlier': 'BOOLEAN DEFAULT false',
        'row_hash': 'TEXT',
        'batch_id': 'UUID',
        'is_valid': 'BOOLEAN DEFAULT true',
        'raw_extras': 'JSONB',
    }

    # Get existing columns
    existing_cols = db.session.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = :table_name
    """), {'table_name': STAGING_TABLE}).fetchall()
    existing_col_names = {row[0] for row in existing_cols}

    # Find missing columns
    missing_cols = [col for col in expected_columns.keys() if col not in existing_col_names]

    # If too many columns missing, drop and recreate
    if len(missing_cols) > 5:
        logger.log(f"  ⚠️  Schema too different ({len(missing_cols)} columns missing), recreating table...")
        db.session.execute(text(f"DROP TABLE IF EXISTS {STAGING_TABLE} CASCADE"))
        db.session.commit()
        _create_staging_table_schema(logger)
        return

    # Add missing columns one by one
    columns_added = []
    for col_name, col_type in expected_columns.items():
        if col_name not in existing_col_names:
            try:
                db.session.execute(text(f"""
                    ALTER TABLE {STAGING_TABLE}
                    ADD COLUMN IF NOT EXISTS {col_name} {col_type}
                """))
                columns_added.append(col_name)
            except Exception as e:
                logger.log(f"  ⚠️  Could not add column {col_name}: {e}")

    if columns_added:
        db.session.commit()
        logger.log(f"  ✓ Added missing columns: {', '.join(columns_added)}")


def _create_staging_table_schema(logger: UploadLogger):
    """Internal: Create the staging table schema."""
    # Create staging table with same schema as transactions
    # Use TEXT for variable-length fields to avoid "value too long" errors
    # Step G: Added psf_source, psf_calc, market_segment_raw, raw_extras
    db.session.execute(text(f"""
        CREATE TABLE {STAGING_TABLE} (
            id SERIAL PRIMARY KEY,
            project_name TEXT NOT NULL,
            transaction_date DATE NOT NULL,
            contract_date VARCHAR(10),
            price FLOAT NOT NULL,
            area_sqft FLOAT NOT NULL,
            psf FLOAT,
            psf_source FLOAT,
            psf_calc FLOAT,
            district VARCHAR(10) NOT NULL,
            bedroom_count INTEGER NOT NULL,
            property_type TEXT DEFAULT 'Condominium',
            sale_type VARCHAR(50),
            tenure TEXT,
            lease_start_year INTEGER,
            remaining_lease INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            street_name TEXT,
            floor_range TEXT,
            floor_level TEXT,
            num_units INTEGER,
            nett_price FLOAT,
            type_of_area TEXT,
            market_segment TEXT,
            market_segment_raw TEXT,
            is_outlier BOOLEAN DEFAULT false,
            row_hash TEXT,
            batch_id UUID,
            is_valid BOOLEAN DEFAULT true,
            raw_extras JSONB
        )
    """))

    # Create indexes for batch-scoped operations
    db.session.execute(text(f"""
        CREATE INDEX IF NOT EXISTS idx_staging_batch ON {STAGING_TABLE}(batch_id);
        CREATE INDEX IF NOT EXISTS idx_staging_row_hash ON {STAGING_TABLE}(row_hash);
    """))

    db.session.commit()
    logger.log("✓ Staging table created")


def insert_to_staging(csv_path: str, sale_type: str, logger: UploadLogger, batch_id: str = None) -> dict:
    """
    Process a single CSV file and insert into staging table.

    Step D: When batch_id is provided, each row is tagged with it for
    batch-scoped deduplication and promotion.

    Returns dict with reconciliation data:
        - source_rows: Total raw rows in CSV (before any processing)
        - rows_loaded: Rows successfully inserted to staging
        - rows_rejected: Rows rejected during insert (missing fields, invalid values)
        - rows_skipped: Rows skipped during cleaning (empty rows, header rows)
    """
    logger.log(f"Processing: {os.path.basename(csv_path)}")

    try:
        # Try different encodings
        encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
        df = None
        for encoding in encodings:
            try:
                df = pd.read_csv(csv_path, encoding=encoding)
                break
            except UnicodeDecodeError:
                continue

        if df is None:
            logger.log(f"  ⚠️  Could not decode with any encoding")
            return {'source_rows': 0, 'rows_loaded': 0, 'rows_rejected': 0, 'rows_skipped': 0}

        raw_rows = len(df)
        original_cols = len(df.columns)

        # Clean with verbose diagnostics
        df = clean_csv_data(df, verbose=True)

        # Show diagnostics
        if hasattr(df, 'attrs') and 'diagnostics' in df.attrs:
            diag = df.attrs['diagnostics']
            if diag.get('total_rejected', 0) > 0:
                logger.log(f"  📊 Cleaning: {diag['initial_rows']} raw -> {diag.get('final_rows', 0)} valid")
                for reason, count in diag.get('rejected', {}).items():
                    logger.log(f"      - {reason}: {count} rejected")
                # Show sample rejected rows
                for sample in diag.get('sample_rejected', [])[:3]:
                    logger.log(f"      Sample: {sample}")

        # Calculate rows skipped during cleaning
        rows_after_clean = len(df) if not df.empty else 0
        rows_skipped_cleaning = raw_rows - rows_after_clean

        if df.empty:
            logger.log(f"  ⚠️  No valid data after cleaning ({raw_rows} raw rows all rejected)")
            return {'source_rows': raw_rows, 'rows_loaded': 0, 'rows_rejected': 0, 'rows_skipped': rows_skipped_cleaning}

        df['sale_type'] = sale_type

        # Insert in batches using raw SQL for staging table
        # Batch size 500 balances round-trip reduction vs memory usage
        batch_size = 500
        total_rows = len(df)
        saved = 0
        insert_rejected = 0
        insert_rejection_reasons = {}
        sample_insert_rejected = []
        current_year = datetime.now().year

        # Progress tracking for diagnosing hangs
        t0 = time.time()
        last_log = 0
        log_every = 500
        log_step(logger, f"Starting upload: {total_rows:,} rows")

        for idx in range(0, total_rows, batch_size):
            batch = df.iloc[idx:idx+batch_size]
            values = []

            for _, row in batch.iterrows():
                try:
                    # Parse transaction_date - REQUIRED field
                    transaction_date = None
                    if 'transaction_date' in row and pd.notna(row['transaction_date']):
                        if isinstance(row['transaction_date'], str):
                            try:
                                transaction_date = pd.to_datetime(row['transaction_date']).date()
                            except Exception:
                                year, month = parse_date_flexible(row['transaction_date'])
                                if year and month:
                                    from datetime import date
                                    transaction_date = date(year, month, 1)
                        elif hasattr(row['transaction_date'], 'date'):
                            transaction_date = row['transaction_date'].date()

                    # Skip rows missing required fields
                    project_name = _safe_str(row.get('project_name') or row.get('Project Name'), default='')
                    district = _safe_str(row.get('district'))
                    price = _safe_float(row.get('price'))
                    area_sqft = _safe_float(row.get('area_sqft'))

                    # Validate required fields
                    if not project_name:
                        insert_rejection_reasons['missing_project_name'] = insert_rejection_reasons.get('missing_project_name', 0) + 1
                        insert_rejected += 1
                        continue
                    if not transaction_date:
                        insert_rejection_reasons['missing_transaction_date'] = insert_rejection_reasons.get('missing_transaction_date', 0) + 1
                        if len(sample_insert_rejected) < 3:
                            sample_insert_rejected.append({'reason': 'missing_transaction_date', 'raw_date': row.get('transaction_date'), 'project': project_name[:30]})
                        insert_rejected += 1
                        continue
                    if not district:
                        insert_rejection_reasons['missing_district'] = insert_rejection_reasons.get('missing_district', 0) + 1
                        insert_rejected += 1
                        continue
                    if price <= 0:
                        insert_rejection_reasons['invalid_price'] = insert_rejection_reasons.get('invalid_price', 0) + 1
                        insert_rejected += 1
                        continue
                    if area_sqft <= 0:
                        insert_rejection_reasons['invalid_area'] = insert_rejection_reasons.get('invalid_area', 0) + 1
                        insert_rejected += 1
                        continue

                    tenure_str = _safe_str(row.get('tenure') or row.get('Tenure'))
                    lease_start_year, remaining_lease = _parse_lease_info(tenure_str, current_year)
                    property_type = _safe_str(row.get('property_type') or row.get('Property Type'), default='Condominium')
                    floor_range = _safe_str(row.get('floor_range')) or None

                    # Step C: Compute row_hash using natural key fields
                    row_hash = compute_transaction_row_hash({
                        'project_name': project_name,
                        'transaction_date': transaction_date,
                        'price': price,
                        'area_sqft': area_sqft,
                        'floor_range': floor_range,
                    })

                    # Step G: PSF reconciliation
                    psf_from_csv = _safe_float(row.get('psf'))
                    psf_data = compute_psf_with_reconciliation(price, area_sqft, psf_from_csv)
                    psf_final = psf_data['psf']
                    psf_source = psf_data['psf_source']
                    psf_calc = psf_data['psf_calc']

                    # Step G: Extract raw_extras for unknown columns
                    raw_extras = extract_raw_extras(row.to_dict(), KNOWN_FIELDS)

                    # Market segment - store raw for audit
                    market_segment_val = _safe_str(row.get('market_segment')) or None

                    values.append({
                        'project_name': project_name,
                        'transaction_date': transaction_date,
                        'contract_date': _safe_str(row.get('contract_date')),
                        'price': price,
                        'area_sqft': area_sqft,
                        'psf': psf_final,
                        'psf_source': psf_source,
                        'psf_calc': psf_calc,
                        'district': district,
                        'bedroom_count': _safe_int(row.get('bedroom_count'), default=1),
                        'property_type': property_type,
                        'sale_type': _safe_str(row.get('sale_type')),
                        'tenure': tenure_str if tenure_str else None,
                        'lease_start_year': lease_start_year,
                        'remaining_lease': remaining_lease,
                        'street_name': _safe_str(row.get('street_name')) or None,
                        'floor_range': floor_range,
                        'floor_level': _safe_str(row.get('floor_level')) or None,
                        'num_units': _safe_int(row.get('num_units')),
                        'nett_price': _safe_float(row.get('nett_price')),  # 0.0 is valid, don't convert to None
                        'type_of_area': _safe_str(row.get('type_of_area')) or None,
                        'market_segment': market_segment_val,
                        'market_segment_raw': market_segment_val,
                        'row_hash': row_hash,
                        'batch_id': batch_id,
                        'raw_extras': json.dumps(raw_extras) if raw_extras else None,
                    })
                except Exception as e:
                    insert_rejection_reasons['exception'] = insert_rejection_reasons.get('exception', 0) + 1
                    insert_rejected += 1
                    continue

            if values:
                # Bulk insert into staging with retry logic for timeout resilience
                batch_num = idx // batch_size + 1
                # Step G: Added psf_source, psf_calc, market_segment_raw, raw_extras
                insert_sql = text(f"""
                    INSERT INTO {STAGING_TABLE} (
                        project_name, transaction_date, contract_date, price, area_sqft,
                        psf, psf_source, psf_calc, district, bedroom_count, property_type, sale_type,
                        tenure, lease_start_year, remaining_lease, street_name,
                        floor_range, floor_level, num_units, nett_price, type_of_area,
                        market_segment, market_segment_raw, row_hash, batch_id, raw_extras
                    ) VALUES (
                        :project_name, :transaction_date, :contract_date, :price, :area_sqft,
                        :psf, :psf_source, :psf_calc, :district, :bedroom_count, :property_type, :sale_type,
                        :tenure, :lease_start_year, :remaining_lease, :street_name,
                        :floor_range, :floor_level, :num_units, :nett_price, :type_of_area,
                        :market_segment, :market_segment_raw, :row_hash, :batch_id, :raw_extras
                    )
                """)

                success, rows_inserted = _execute_with_retry(
                    db.session, insert_sql, values, logger, batch_num, max_retries=3
                )

                if success:
                    saved += rows_inserted
                    # Progress logging every log_every rows
                    done = idx + len(batch)
                    if done - last_log >= log_every or done == total_rows:
                        elapsed = time.time() - t0
                        rate = done / elapsed if elapsed > 0 else 0
                        log_step(logger, f"Progress: {done:,}/{total_rows:,} rows ({rate:,.0f}/s)")
                        last_log = done
                else:
                    insert_rejection_reasons['sql_error'] = insert_rejection_reasons.get('sql_error', 0) + len(values)
                    insert_rejected += len(values)

        # Log results with rejection details
        if insert_rejected > 0:
            logger.log(f"  ✓ Saved {saved:,} rows, rejected {insert_rejected:,} during insert")
            for reason, count in insert_rejection_reasons.items():
                logger.log(f"      - {reason}: {count}")
            for sample in sample_insert_rejected[:3]:
                logger.log(f"      Sample: {sample}")
        else:
            logger.log(f"  ✓ Saved {saved:,} rows (from {original_cols} CSV columns)")

        # Log source reconciliation
        logger.log(f"  📊 Reconciliation: {raw_rows} source = {saved} loaded + {insert_rejected} rejected + {rows_skipped_cleaning} skipped")

        del df
        gc.collect()
        return {
            'source_rows': raw_rows,
            'rows_loaded': saved,
            'rows_rejected': insert_rejected,
            'rows_skipped': rows_skipped_cleaning
        }

    except Exception as e:
        logger.log(f"  ⚠️  Error: {e}")
        import traceback
        traceback.print_exc()
        return {'source_rows': 0, 'rows_loaded': 0, 'rows_rejected': 0, 'rows_skipped': 0}


# =============================================================================
# VALIDATION ON STAGING
# =============================================================================

def remove_duplicates_staging(logger: UploadLogger, batch_id: str = None) -> int:
    """
    Remove duplicates from staging table.

    Step D: When batch_id is provided, only dedup within that batch.
    """
    if batch_id:
        logger.log(f"  Batch-scoped dedup for batch={batch_id[:8]}...")
        # Batch-scoped dedup: only remove duplicates within this batch
        before = db.session.execute(
            text(f"SELECT COUNT(*) FROM {STAGING_TABLE} WHERE batch_id = :batch_id"),
            {'batch_id': batch_id}
        ).scalar()

        db.session.execute(text(f"""
            DELETE FROM {STAGING_TABLE}
            WHERE batch_id = :batch_id
              AND id NOT IN (
                SELECT MIN(id)
                FROM {STAGING_TABLE}
                WHERE batch_id = :batch_id
                GROUP BY project_name, transaction_date, price, area_sqft,
                         COALESCE(floor_range, '')
            )
        """), {'batch_id': batch_id})
        db.session.commit()

        after = db.session.execute(
            text(f"SELECT COUNT(*) FROM {STAGING_TABLE} WHERE batch_id = :batch_id"),
            {'batch_id': batch_id}
        ).scalar()
    else:
        logger.log("  Batch id not provided - processing entire staging table")
        before = db.session.execute(text(f"SELECT COUNT(*) FROM {STAGING_TABLE}")).scalar()
        logger.log(f"  Before count: {before:,} rows, running DELETE query...")

        db.session.execute(text(f"""
            DELETE FROM {STAGING_TABLE}
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM {STAGING_TABLE}
                GROUP BY project_name, transaction_date, price, area_sqft,
                         COALESCE(floor_range, '')
            )
        """))
        db.session.commit()

        after = db.session.execute(text(f"SELECT COUNT(*) FROM {STAGING_TABLE}")).scalar()

    removed = before - after
    logger.log(f"✓ Removed {removed:,} duplicates from staging")
    return removed


def filter_outliers_staging(logger: UploadLogger, batch_id: str = None) -> Tuple[int, Dict]:
    """
    Mark outliers in staging using two-stage detection (soft-delete).

    Stage 1: En-bloc/collective sales detection (area-based)
      - Units with area_sqft > 10,000 are likely en-bloc collective sales
      - These have total development area, not individual unit area

    Stage 2: Price outliers using relaxed IQR method (3x instead of 1.5x)
      - Uses 3x IQR to avoid excluding legitimate luxury condos ($4M-$10M)
      - Still catches extreme price outliers

    Marks outliers with is_outlier=true instead of deleting them.

    Step D: When batch_id is provided, only mark outliers within that batch.
    """
    # Build batch filter clause
    batch_filter = ""
    params = {}
    if batch_id:
        batch_filter = "AND batch_id = :batch_id"
        params['batch_id'] = batch_id

    if batch_id:
        before = db.session.execute(
            text(f"SELECT COUNT(*) FROM {STAGING_TABLE} WHERE batch_id = :batch_id"),
            {'batch_id': batch_id}
        ).scalar()
    else:
        before = db.session.execute(text(f"SELECT COUNT(*) FROM {STAGING_TABLE}")).scalar()

    # ==========================================================================
    # STAGE 1: Mark en-bloc/collective sales (area > 10,000 sqft)
    # ==========================================================================
    # En-bloc sales have the total development area, not individual unit area
    # Normal condos are typically < 5,000 sqft even for penthouses
    EN_BLOC_AREA_THRESHOLD = 10000  # sqft

    enbloc_marked = db.session.execute(text(f"""
        UPDATE {STAGING_TABLE}
        SET is_outlier = true
        WHERE area_sqft > :threshold
          AND (is_outlier = false OR is_outlier IS NULL)
          {batch_filter}
    """), {'threshold': EN_BLOC_AREA_THRESHOLD, **params})

    enbloc_count = enbloc_marked.rowcount
    db.session.commit()

    if enbloc_count > 0:
        logger.log(f"  Stage 1: Marked {enbloc_count:,} en-bloc sales (area > {EN_BLOC_AREA_THRESHOLD:,} sqft)")

    # ==========================================================================
    # STAGE 2: Price-based IQR outlier detection (5x IQR - relaxed)
    # ==========================================================================
    # Calculate IQR on NON-enbloc records only (exclude already-marked outliers)
    IQR_MULTIPLIER = 5.0  # Relaxed from 1.5x to include luxury condos up to ~$7.6M

    logger.log("  Running PERCENTILE_CONT query (may take time on large datasets)...")
    result = db.session.execute(text(f"""
        SELECT
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price) as q1,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price) as q3
        FROM {STAGING_TABLE}
        WHERE price > 0
          AND (is_outlier = false OR is_outlier IS NULL)
          {batch_filter}
    """), params).fetchone()

    if not result or not result.q1 or not result.q3:
        logger.log("⚠️  Could not calculate IQR bounds")
        return enbloc_count, {'before': before, 'after': before - enbloc_count}

    q1, q3 = float(result.q1), float(result.q3)
    iqr = q3 - q1
    lower_bound = q1 - IQR_MULTIPLIER * iqr
    upper_bound = q3 + IQR_MULTIPLIER * iqr

    logger.log(f"  Stage 2: IQR bounds (3x): Q1=${q1:,.0f}, Q3=${q3:,.0f}, IQR=${iqr:,.0f}")
    logger.log(f"  Valid price range: ${max(0, lower_bound):,.0f} - ${upper_bound:,.0f}")

    # Mark price outliers (excluding already-marked en-bloc sales)
    price_marked = db.session.execute(text(f"""
        UPDATE {STAGING_TABLE}
        SET is_outlier = true
        WHERE (price < :lower_bound OR price > :upper_bound)
          AND (is_outlier = false OR is_outlier IS NULL)
          {batch_filter}
    """), {'lower_bound': lower_bound, 'upper_bound': upper_bound, **params})

    price_outlier_count = price_marked.rowcount
    db.session.commit()

    if price_outlier_count > 0:
        logger.log(f"  Stage 2: Marked {price_outlier_count:,} price outliers")

    total_marked = enbloc_count + price_outlier_count

    # Count active (non-outlier) records
    if batch_id:
        active_count = db.session.execute(
            text(f"SELECT COUNT(*) FROM {STAGING_TABLE} WHERE is_outlier = false AND batch_id = :batch_id"),
            {'batch_id': batch_id}
        ).scalar()
    else:
        active_count = db.session.execute(text(f"""
            SELECT COUNT(*) FROM {STAGING_TABLE} WHERE is_outlier = false
        """)).scalar()

    logger.log(f"✓ Total outliers marked: {total_marked:,} (en-bloc: {enbloc_count}, price: {price_outlier_count})")
    logger.log(f"  Active records: {active_count:,}")

    return total_marked, {
        'before': before,
        'after': active_count,
        'total_marked': total_marked,
        'enbloc_count': enbloc_count,
        'price_outlier_count': price_outlier_count,
        'q1': q1,
        'q3': q3,
        'iqr': iqr,
        'iqr_multiplier': IQR_MULTIPLIER,
        'lower_bound': lower_bound,
        'upper_bound': upper_bound,
        'enbloc_area_threshold': EN_BLOC_AREA_THRESHOLD
    }


def validate_staging(logger: UploadLogger, batch_id: str = None) -> Tuple[bool, List[str]]:
    """
    Run validation checks on staging table.

    Step D: When batch_id is provided, only validate that batch.

    Returns (is_valid, list_of_issues).
    """
    logger.log("Running validation checks on staging data...")
    issues = []

    # Build batch filter clause
    batch_filter = ""
    params = {}
    if batch_id:
        batch_filter = "WHERE batch_id = :batch_id"
        batch_filter_and = "AND batch_id = :batch_id"
        params['batch_id'] = batch_id
    else:
        batch_filter_and = ""

    # 1. Row count check
    if batch_id:
        row_count = db.session.execute(
            text(f"SELECT COUNT(*) FROM {STAGING_TABLE} WHERE batch_id = :batch_id"),
            {'batch_id': batch_id}
        ).scalar()
    else:
        row_count = db.session.execute(text(f"SELECT COUNT(*) FROM {STAGING_TABLE}")).scalar()
    logger.log(f"  Row count: {row_count:,}")

    if row_count < VALIDATION_CONFIG['min_row_count']:
        issues.append(f"Row count {row_count} below minimum {VALIDATION_CONFIG['min_row_count']}")

    # 2. Null rate checks for required columns
    for column, max_rate in VALIDATION_CONFIG['max_null_rate'].items():
        if batch_id:
            null_count = db.session.execute(
                text(f"SELECT COUNT(*) FROM {STAGING_TABLE} WHERE {column} IS NULL AND batch_id = :batch_id"),
                {'batch_id': batch_id}
            ).scalar()
        else:
            null_count = db.session.execute(text(f"""
                SELECT COUNT(*) FROM {STAGING_TABLE} WHERE {column} IS NULL
            """)).scalar()
        null_rate = null_count / row_count if row_count > 0 else 1.0

        if null_rate > max_rate:
            issues.append(f"Column '{column}' null rate {null_rate:.2%} exceeds {max_rate:.2%}")
        else:
            logger.log(f"  ✓ {column} null rate: {null_rate:.2%}")

    # 3. Price range sanity check
    min_price, max_price = VALIDATION_CONFIG['price_range']
    if batch_id:
        invalid_prices = db.session.execute(text(f"""
            SELECT COUNT(*) FROM {STAGING_TABLE}
            WHERE (price < :min_price OR price > :max_price) AND batch_id = :batch_id
        """), {'min_price': min_price, 'max_price': max_price, 'batch_id': batch_id}).scalar()
    else:
        invalid_prices = db.session.execute(text(f"""
            SELECT COUNT(*) FROM {STAGING_TABLE}
            WHERE price < :min_price OR price > :max_price
        """), {'min_price': min_price, 'max_price': max_price}).scalar()

    if invalid_prices > 0:
        rate = invalid_prices / row_count
        if rate > 0.01:  # More than 1% invalid
            issues.append(f"{invalid_prices} rows ({rate:.2%}) have prices outside valid range")
        else:
            logger.log(f"  ✓ Price range: {invalid_prices} outliers ({rate:.4%})")

    # 4. PSF range sanity check
    min_psf, max_psf = VALIDATION_CONFIG['psf_range']
    if batch_id:
        invalid_psf = db.session.execute(text(f"""
            SELECT COUNT(*) FROM {STAGING_TABLE}
            WHERE (psf < :min_psf OR psf > :max_psf) AND batch_id = :batch_id
        """), {'min_psf': min_psf, 'max_psf': max_psf, 'batch_id': batch_id}).scalar()
    else:
        invalid_psf = db.session.execute(text(f"""
            SELECT COUNT(*) FROM {STAGING_TABLE}
            WHERE psf < :min_psf OR psf > :max_psf
        """), {'min_psf': min_psf, 'max_psf': max_psf}).scalar()

    if invalid_psf > 0:
        rate = invalid_psf / row_count
        if rate > 0.01:
            issues.append(f"{invalid_psf} rows ({rate:.2%}) have PSF outside valid range")
        else:
            logger.log(f"  ✓ PSF range: {invalid_psf} outliers ({rate:.4%})")

    # 5. District distribution check
    if batch_id:
        district_counts = db.session.execute(text(f"""
            SELECT district, COUNT(*) as cnt FROM {STAGING_TABLE}
            WHERE batch_id = :batch_id
            GROUP BY district ORDER BY cnt DESC LIMIT 5
        """), {'batch_id': batch_id}).fetchall()
    else:
        district_counts = db.session.execute(text(f"""
            SELECT district, COUNT(*) as cnt FROM {STAGING_TABLE}
            GROUP BY district ORDER BY cnt DESC LIMIT 5
        """)).fetchall()
    logger.log(f"  Top districts: {[(d.district, d.cnt) for d in district_counts]}")

    # 6. Date range check
    if batch_id:
        date_range = db.session.execute(text(f"""
            SELECT MIN(transaction_date), MAX(transaction_date) FROM {STAGING_TABLE}
            WHERE batch_id = :batch_id
        """), {'batch_id': batch_id}).fetchone()
    else:
        date_range = db.session.execute(text(f"""
            SELECT MIN(transaction_date), MAX(transaction_date) FROM {STAGING_TABLE}
        """)).fetchone()
    logger.log(f"  Date range: {date_range[0]} to {date_range[1]}")

    is_valid = len(issues) == 0

    if is_valid:
        logger.log("✅ All validation checks passed")
    else:
        logger.log("❌ Validation failed:")
        for issue in issues:
            logger.log(f"   - {issue}")

    return is_valid, issues


# =============================================================================
# ATOMIC PUBLISH (TABLE SWAP)
# =============================================================================

def atomic_publish(logger: UploadLogger, batch_id: str = None) -> Tuple[bool, Dict]:
    """
    Publish staging data to production.

    Step E: Idempotent promotion using INSERT ... ON CONFLICT DO NOTHING.

    Returns (success, stats) where stats contains:
    - rows_promoted: Number of rows successfully inserted
    - rows_skipped_collision: Number of rows skipped due to conflict
    """
    stats = {'rows_promoted': 0, 'rows_skipped_collision': 0}

    # ==========================================================================
    # PUBLISH GUARDRAIL 1: Verify unique constraint exists for idempotent promotion
    # ==========================================================================
    # ON CONFLICT requires a unique constraint. If it doesn't exist, the INSERT
    # will fail with a confusing error. Verify upfront.
    constraint_exists = db.session.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = :table
            AND indexname = 'idx_transactions_natural_key'
        )
    """), {'table': PRODUCTION_TABLE}).scalar()

    if not constraint_exists:
        logger.log("❌ PUBLISH BLOCKED: Required unique constraint missing")
        logger.log("   The idx_transactions_natural_key index does not exist on production.")
        logger.log("   Run this SQL to create it:")
        logger.log("   CREATE UNIQUE INDEX idx_transactions_natural_key")
        logger.log(f"   ON {PRODUCTION_TABLE}(project_name, transaction_date, price, area_sqft, COALESCE(floor_range, ''));")
        return False, stats

    # ==========================================================================
    # PUBLISH GUARDRAIL 2: Key completeness (natural key columns not NULL)
    # ==========================================================================
    # The natural key is (project_name, transaction_date, price, area_sqft, floor_range)
    # floor_range can be NULL (handled by COALESCE in index), but the others must not be.
    NATURAL_KEY_COLS = ['project_name', 'transaction_date', 'price', 'area_sqft']
    NULL_THRESHOLD = 0.001  # Allow 0.1% NULLs (for tiny data quality issues)

    for col in NATURAL_KEY_COLS:
        null_count = db.session.execute(text(f"""
            SELECT COUNT(*) FROM {STAGING_TABLE}
            WHERE {col} IS NULL AND (is_valid = true OR is_valid IS NULL)
        """)).scalar() or 0

        total_count = db.session.execute(text(f"""
            SELECT COUNT(*) FROM {STAGING_TABLE}
            WHERE is_valid = true OR is_valid IS NULL
        """)).scalar() or 1

        null_rate = null_count / total_count
        if null_rate > NULL_THRESHOLD:
            logger.log(f"❌ PUBLISH BLOCKED: Natural key column '{col}' has {null_rate:.2%} NULLs")
            logger.log(f"   Threshold: {NULL_THRESHOLD:.2%}")
            logger.log(f"   Fix the data quality issue before publishing.")
            return False, stats

    return _idempotent_promote(logger, batch_id, stats)


def _idempotent_promote(logger: UploadLogger, batch_id: str, stats: Dict) -> Tuple[bool, Dict]:
    """
    Step E: Idempotent promotion using INSERT ... ON CONFLICT DO NOTHING.

    Promotes rows from staging to production without replacing existing data.
    Requires:
    - row_hash column with unique index on production table
    - batch_id to filter which staging rows to promote
    """
    logger.log("Starting idempotent promotion...")

    try:
        # ==========================================================================
        # PUBLISH GUARDRAIL 5: Batch ownership enforcement
        # ==========================================================================
        # Promotion must be for a specific batch_id. This prevents:
        # - Promoting stale data from failed runs
        # - Accidentally promoting data from multiple batches
        if not batch_id:
            logger.log("❌ PUBLISH BLOCKED: No batch_id specified")
            logger.log("   Idempotent promotion requires a specific batch_id.")
            logger.log("   This ensures only the intended data is promoted.")
            return False, stats

        # Verify the batch_id exists in staging
        batch_exists = db.session.execute(text(f"""
            SELECT EXISTS (
                SELECT 1 FROM {STAGING_TABLE}
                WHERE batch_id = :batch_id
                LIMIT 1
            )
        """), {'batch_id': batch_id}).scalar()

        if not batch_exists:
            logger.log(f"❌ PUBLISH BLOCKED: Batch {batch_id[:8]}... not found in staging")
            # Show what batches ARE in staging
            existing_batches = db.session.execute(text(f"""
                SELECT batch_id, COUNT(*) as cnt
                FROM {STAGING_TABLE}
                GROUP BY batch_id
            """)).fetchall()
            if existing_batches:
                logger.log("   Available batches in staging:")
                for b in existing_batches:
                    bid = str(b[0])[:8] if b[0] else 'NULL'
                    logger.log(f"     - {bid}...: {b[1]:,} rows")
            return False, stats

        logger.log(f"  Batch ownership verified: {batch_id[:8]}...")

        # Build batch filter
        batch_filter = "AND batch_id = :batch_id"
        params = {'batch_id': batch_id}

        # Count staging rows to promote
        staging_count = db.session.execute(
            text(f"SELECT COUNT(*) FROM {STAGING_TABLE} WHERE (is_valid = true OR is_valid IS NULL) AND batch_id = :batch_id"),
            {'batch_id': batch_id}
        ).scalar()

        if staging_count == 0:
            logger.log("❌ No valid staging rows to promote")
            return False, stats

        logger.log(f"  Promoting {staging_count:,} rows from staging...")

        # Ensure production table has natural key unique index
        # (row_hash index requires backfilling existing data, so use natural key instead)
        db.session.execute(text(f"""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_natural_key
            ON {PRODUCTION_TABLE}(project_name, transaction_date, price, area_sqft, COALESCE(floor_range, ''))
        """))

        # Count before
        before_count = db.session.execute(
            text(f"SELECT COUNT(*) FROM {PRODUCTION_TABLE}")
        ).scalar()

        # Idempotent insert: ON CONFLICT DO NOTHING
        # Note: is_outlier rows ARE promoted (not filtered)
        # Step G: Added psf_source, psf_calc, market_segment_raw, raw_extras
        result = db.session.execute(text(f"""
            INSERT INTO {PRODUCTION_TABLE} (
                project_name, transaction_date, contract_date, price, area_sqft,
                psf, psf_source, psf_calc, district, bedroom_count, property_type, sale_type,
                tenure, lease_start_year, remaining_lease, street_name,
                floor_range, floor_level, num_units, nett_price, type_of_area,
                market_segment, market_segment_raw, is_outlier, row_hash, raw_extras
            )
            SELECT
                project_name, transaction_date, contract_date, price, area_sqft,
                psf, psf_source, psf_calc, district, bedroom_count, property_type, sale_type,
                tenure, lease_start_year, remaining_lease, street_name,
                floor_range, floor_level, num_units, nett_price, type_of_area,
                market_segment, market_segment_raw, is_outlier, row_hash, raw_extras
            FROM {STAGING_TABLE}
            WHERE (is_valid = true OR is_valid IS NULL)
              {batch_filter}
            ON CONFLICT (project_name, transaction_date, price, area_sqft, COALESCE(floor_range, '')) DO NOTHING
        """), params)

        rows_promoted = result.rowcount
        db.session.commit()

        # Count after
        after_count = db.session.execute(
            text(f"SELECT COUNT(*) FROM {PRODUCTION_TABLE}")
        ).scalar()

        # Calculate stats
        stats['rows_promoted'] = rows_promoted
        stats['rows_skipped_collision'] = staging_count - rows_promoted

        logger.log(f"✅ Idempotent promotion complete!")
        logger.log(f"  Rows promoted: {rows_promoted:,}")
        logger.log(f"  Rows skipped (collision): {stats['rows_skipped_collision']:,}")
        logger.log(f"  Production table: {before_count:,} → {after_count:,}")

        return True, stats

    except Exception as e:
        db.session.rollback()
        logger.log(f"❌ Promotion failed: {e}")
        import traceback
        traceback.print_exc()
        return False, stats


def rollback_to_previous(logger: UploadLogger) -> bool:
    """
    Rollback production to previous version.
    """
    logger.log("Starting rollback to previous version...")

    try:
        # Check if previous table exists
        prev_exists = db.session.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = :table_name
            )
        """), {'table_name': PREVIOUS_TABLE}).scalar()

        if not prev_exists:
            logger.log("❌ No previous version available for rollback")
            return False

        prev_count = db.session.execute(
            text(f"SELECT COUNT(*) FROM {PREVIOUS_TABLE}")
        ).scalar()
        logger.log(f"  Previous version has {prev_count:,} rows")

        # Swap tables
        db.session.execute(text(f"DROP TABLE IF EXISTS {STAGING_TABLE} CASCADE"))
        db.session.execute(text(f"ALTER TABLE {PRODUCTION_TABLE} RENAME TO {STAGING_TABLE}"))
        db.session.execute(text(f"ALTER TABLE {PREVIOUS_TABLE} RENAME TO {PRODUCTION_TABLE}"))

        db.session.commit()

        new_count = db.session.execute(
            text(f"SELECT COUNT(*) FROM {PRODUCTION_TABLE}")
        ).scalar()
        logger.log(f"✅ Rollback complete! Production now has {new_count:,} rows")

        return True

    except Exception as e:
        db.session.rollback()
        logger.log(f"❌ Rollback failed: {e}")
        return False


# =============================================================================
# SCHEMA CHECK
# =============================================================================

def run_schema_check(rawdata_path: str) -> bool:
    """Check CSV to database schema parity."""
    print("=" * 60)
    print("Schema Parity Check")
    print("=" * 60)

    print("\n📊 Checking Transaction model columns...")
    db_columns = get_db_columns()
    print(f"   Found {len(db_columns)} columns in Transaction model")

    csv_path = find_sample_csv(rawdata_path)
    if csv_path:
        print(f"\n📄 Checking CSV file: {os.path.basename(csv_path)}")
        df = pd.read_csv(csv_path, nrows=0)
        csv_columns = set(df.columns)
        print(f"   Found {len(csv_columns)} columns in CSV")
    else:
        print("\n⚠️  No CSV file found. Using expected column list.")
        csv_columns = EXPECTED_CSV_COLUMNS

    print("\n🔍 Checking CSV → DB mapping...")
    issues = []

    for csv_col in csv_columns:
        if csv_col in CSV_TO_DB_MAPPING:
            db_col = CSV_TO_DB_MAPPING[csv_col]
            if db_col not in db_columns:
                issues.append(f"CSV '{csv_col}' maps to DB '{db_col}' but column doesn't exist")

    missing_expected = EXPECTED_CSV_COLUMNS - csv_columns
    for col in missing_expected:
        issues.append(f"Expected CSV column '{col}' not found")

    if issues:
        print("   ❌ Issues found:")
        for issue in issues:
            print(f"      - {issue}")
        return False
    else:
        print("   ✅ All CSV columns have valid DB mappings")
        return True


# =============================================================================
# PLAN MODE (Step F)
# =============================================================================

def generate_plan_report(
    logger: 'UploadLogger',
    run_ctx: Optional['RunContext'],
    batch_id: Optional[str],
    total_staged: int,
    duplicates_removed: int,
    outliers_marked: int
) -> Dict[str, Any]:
    """
    Generate a plan report showing what would change if promoted.

    Step F: --plan mode for safe preview without touching production.

    Returns a report dict with:
    - Staging stats (rows, duplicates, outliers)
    - Date window (min/max transaction dates)
    - District distribution (count per district)
    - Collision preview (rows that already exist in production)
    """
    report = {
        'batch_id': batch_id[:8] if batch_id else 'N/A',
        'schema_version': run_ctx.schema_version if run_ctx else 'N/A',
        'rules_version': run_ctx.rules_version if run_ctx else 'N/A',
        'staging': {
            'total_loaded': total_staged,
            'duplicates_removed': duplicates_removed,
            'after_dedup': total_staged - duplicates_removed,
            'outliers_marked': outliers_marked,
        },
        'date_window': {},
        'district_distribution': {},
        'collision_preview': {},
    }

    # Build batch filter for queries
    batch_filter = ""
    params = {}
    if batch_id:
        batch_filter = "AND batch_id = :batch_id"
        params['batch_id'] = batch_id

    # Get date window from staging
    try:
        date_result = db.session.execute(text(f"""
            SELECT
                MIN(transaction_date) as min_date,
                MAX(transaction_date) as max_date,
                COUNT(DISTINCT DATE_TRUNC('month', transaction_date)) as months
            FROM {STAGING_TABLE}
            WHERE (is_valid = true OR is_valid IS NULL)
              {batch_filter}
        """), params).fetchone()

        if date_result:
            report['date_window'] = {
                'min_date': str(date_result[0]) if date_result[0] else None,
                'max_date': str(date_result[1]) if date_result[1] else None,
                'months_covered': date_result[2] or 0,
            }
    except Exception as e:
        logger.log(f"  Warning: Could not get date window: {e}")

    # Get district distribution from staging
    try:
        district_result = db.session.execute(text(f"""
            SELECT district, COUNT(*) as cnt
            FROM {STAGING_TABLE}
            WHERE (is_valid = true OR is_valid IS NULL)
              AND district IS NOT NULL
              {batch_filter}
            GROUP BY district
            ORDER BY district
        """), params).fetchall()

        report['district_distribution'] = {
            row[0]: row[1] for row in district_result
        }
    except Exception as e:
        logger.log(f"  Warning: Could not get district distribution: {e}")

    # Preview collisions (rows that already exist in production)
    try:
        # Check how many staging rows have row_hash matching production
        collision_result = db.session.execute(text(f"""
            SELECT COUNT(*) as collision_count
            FROM {STAGING_TABLE} s
            WHERE (s.is_valid = true OR s.is_valid IS NULL)
              AND s.row_hash IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM {PRODUCTION_TABLE} p
                  WHERE p.row_hash = s.row_hash
              )
              {("AND s.batch_id = :batch_id") if batch_filter else ''}
        """), params).fetchone()

        new_rows_result = db.session.execute(text(f"""
            SELECT COUNT(*) as new_count
            FROM {STAGING_TABLE} s
            WHERE (s.is_valid = true OR s.is_valid IS NULL)
              AND (s.row_hash IS NULL OR NOT EXISTS (
                  SELECT 1 FROM {PRODUCTION_TABLE} p
                  WHERE p.row_hash = s.row_hash
              ))
              {("AND s.batch_id = :batch_id") if batch_filter else ''}
        """), params).fetchone()

        report['collision_preview'] = {
            'existing_duplicates': collision_result[0] if collision_result else 0,
            'new_rows_to_insert': new_rows_result[0] if new_rows_result else 0,
        }
    except Exception as e:
        logger.log(f"  Warning: Could not preview collisions: {e}")
        report['collision_preview'] = {
            'existing_duplicates': 'N/A',
            'new_rows_to_insert': 'N/A',
            'note': 'Production table may not have row_hash column yet',
        }

    # Get sale type breakdown
    try:
        sale_type_result = db.session.execute(text(f"""
            SELECT sale_type, COUNT(*) as cnt
            FROM {STAGING_TABLE}
            WHERE (is_valid = true OR is_valid IS NULL)
              {batch_filter}
            GROUP BY sale_type
        """), params).fetchall()

        report['sale_type_breakdown'] = {
            row[0] or 'Unknown': row[1] for row in sale_type_result
        }
    except Exception as e:
        logger.log(f"  Warning: Could not get sale type breakdown: {e}")

    return report


def print_plan_report(report: Dict[str, Any], logger: 'UploadLogger'):
    """Print the plan report in a human-readable format."""
    print("\n" + "=" * 60)
    print("📊 ETL PLAN - What Will Change")
    print("=" * 60)

    print(f"\nBatch ID: {report['batch_id']}")
    print(f"Schema: {report['schema_version']} | Rules: {report['rules_version']}")

    # Staging stats
    staging = report.get('staging', {})
    print(f"\n📥 Staging Summary:")
    print(f"   Total loaded:        {staging.get('total_loaded', 0):,}")
    print(f"   Duplicates removed:  {staging.get('duplicates_removed', 0):,}")
    print(f"   After dedup:         {staging.get('after_dedup', 0):,}")
    print(f"   Outliers marked:     {staging.get('outliers_marked', 0):,}")

    # Date window
    date_window = report.get('date_window', {})
    if date_window.get('min_date'):
        print(f"\n📅 Date Window:")
        print(f"   Min: {date_window.get('min_date')}")
        print(f"   Max: {date_window.get('max_date')}")
        print(f"   Months covered: {date_window.get('months_covered')}")

    # Collision preview
    collision = report.get('collision_preview', {})
    if collision:
        print("\n🔄 Collision Preview:")
        if isinstance(collision.get('existing_duplicates'), int):
            print(f"   Already exist (will skip):   {collision.get('existing_duplicates', 0):,}")
            print(f"   New rows (will insert):      {collision.get('new_rows_to_insert', 0):,}")
        else:
            print(f"   Note: {collision.get('note', 'Unable to preview collisions')}")

    # Sale type breakdown
    sale_types = report.get('sale_type_breakdown', {})
    if sale_types:
        print(f"\n📊 Sale Type Breakdown:")
        for sale_type, count in sorted(sale_types.items()):
            print(f"   {sale_type}: {count:,}")

    # District distribution (top 10)
    districts = report.get('district_distribution', {})
    if districts:
        print(f"\n📍 District Distribution (top 10):")
        sorted_districts = sorted(districts.items(), key=lambda x: x[1], reverse=True)[:10]
        for district, count in sorted_districts:
            print(f"   {district}: {count:,}")

    print("\n" + "-" * 60)
    print("Run without --plan to promote to production.")
    print("=" * 60 + "\n")


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def discover_csv_files(csv_folder: str) -> Tuple[List[str], List[str], List[str]]:
    """
    Discover CSV files BEFORE any database operations.

    Returns:
        Tuple of (new_sale_files, resale_files, subsale_files)
    """
    new_sale_files = []
    resale_files = []
    subsale_files = []

    new_sale_folder = os.path.join(csv_folder, 'New Sale')
    if os.path.exists(new_sale_folder):
        new_sale_files = [
            os.path.join(new_sale_folder, f)
            for f in sorted(os.listdir(new_sale_folder))
            if f.endswith('.csv')
        ]

    resale_folder = os.path.join(csv_folder, 'Resale')
    if os.path.exists(resale_folder):
        resale_files = [
            os.path.join(resale_folder, f)
            for f in sorted(os.listdir(resale_folder))
            if f.endswith('.csv')
        ]

    subsale_folder = os.path.join(csv_folder, 'Subsale')
    if os.path.exists(subsale_folder):
        subsale_files = [
            os.path.join(subsale_folder, f)
            for f in sorted(os.listdir(subsale_folder))
            if f.endswith('.csv')
        ]

    return new_sale_files, resale_files, subsale_files


def safe_release_advisory_lock():
    """
    Safely release advisory lock with proper transaction handling.

    Must rollback any failed transaction first, then release lock.
    Handles connection failures gracefully - if connection is dead,
    the advisory lock is automatically released by PostgreSQL.
    """
    try:
        # Always rollback first to ensure clean transaction state
        try:
            db.session.rollback()
        except Exception:
            pass  # Connection may be dead, that's okay

        # Try to release lock - if connection is dead, lock is auto-released
        try:
            db.session.execute(text(f"SELECT pg_advisory_unlock({ADVISORY_LOCK_ID})"))
            db.session.commit()
        except OperationalError:
            # Connection lost - PostgreSQL auto-releases advisory locks on disconnect
            print(f"   Note: Connection lost, advisory lock auto-released by PostgreSQL")
        except Exception as e:
            print(f"   Warning: Advisory lock release issue: {e}")

    except Exception as e:
        # Outer catch-all - cleanup should never crash the script
        print(f"   Warning: Cleanup failed: {e}")


def main():
    """Main upload function with staging + atomic publish."""
    parser = argparse.ArgumentParser(
        description='Production-grade data upload with zero downtime'
    )
    parser.add_argument(
        '--staging-only',
        action='store_true',
        help='Load data to staging table only, do not publish'
    )
    parser.add_argument(
        '--publish',
        action='store_true',
        help='Publish existing staging table to production'
    )
    parser.add_argument(
        '--rollback',
        action='store_true',
        help='Rollback production to previous version'
    )
    parser.add_argument(
        '--check',
        action='store_true',
        help='Run schema parity check only (no import)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview what would be imported without changes'
    )
    parser.add_argument(
        '--skip-validation',
        action='store_true',
        help='Skip validation checks (not recommended)'
    )
    parser.add_argument(
        '--force', '-f',
        action='store_true',
        help='Skip confirmation prompts'
    )
    parser.add_argument(
        '--plan',
        action='store_true',
        help='Preview changes without touching production (dry-run diff)'
    )
    parser.add_argument(
        '--clear-staging',
        action='store_true',
        help='Clear staging table before loading (removes stale data from failed runs)'
    )
    parser.add_argument(
        '--resume-batch',
        type=str,
        metavar='BATCH_ID',
        help='Resume a previously failed batch instead of starting fresh. '
             'Use this to continue where a failed run left off.'
    )
    args = parser.parse_args()

    # Generate run ID for this upload
    run_id = str(uuid.uuid4())
    logger = UploadLogger(run_id)
    exit_code = 0  # Track exit code instead of calling sys.exit() mid-flow

    print("=" * 60)
    print("CSV Upload Script - Zero Downtime Architecture")
    print(f"Run ID: {run_id}")
    print("=" * 60)

    csv_folder = os.path.join(os.path.dirname(__file__), '..', 'rawdata')

    # === PRE-FLIGHT CHECKS (before any DB operations) ===

    # Check CSV folder exists
    if not os.path.exists(csv_folder):
        print(f"\n❌ Error: CSV folder not found: {csv_folder}")
        sys.exit(1)

    # Discover CSV files BEFORE touching the database
    # This prevents "no files found" errors after DB work has started
    if not args.check and not args.publish and not args.rollback:
        new_sale_files, resale_files, subsale_files = discover_csv_files(csv_folder)
        total_csv_files = len(new_sale_files) + len(resale_files) + len(subsale_files)

        if total_csv_files == 0 and not args.dry_run:
            print(f"\n❌ No CSV files found in {csv_folder}")
            print(f"   Expected: rawdata/New Sale/*.csv, rawdata/Resale/*.csv, and/or rawdata/Subsale/*.csv")
            sys.exit(1)

        print(f"\n📂 Found {total_csv_files} CSV files")
        print(f"   New Sale: {len(new_sale_files)} files")
        print(f"   Resale: {len(resale_files)} files")
        print(f"   Subsale: {len(subsale_files)} files")

        # Step A: Contract-based header check (before loading)
        if CONTRACT_AVAILABLE:
            all_csv_files = new_sale_files + resale_files + subsale_files
            contract_valid, contract_report = run_contract_preflight(all_csv_files, logger)
            # Step A: Report only, don't block (no behavior change)
            # Future steps will use contract_report for batch tracking

    app = create_app()

    # === PREFLIGHT DATABASE CHECK ===
    # Run connectivity check BEFORE any operations
    # This fails fast with clear error messages
    preflight_db_check(app)

    # Schema check mode (read-only, no lock needed)
    if args.check:
        with app.app_context():
            success = run_schema_check(csv_folder)
            sys.exit(0 if success else 1)

    # Dry run mode (read-only, no lock needed)
    if args.dry_run:
        with app.app_context():
            from models.transaction import Transaction
            existing_count = db.session.query(Transaction).count()

            new_sale_files, resale_files, subsale_files = discover_csv_files(csv_folder)

            print(f"\n📂 DRY RUN - No changes will be made")
            print(f"   Current production rows: {existing_count:,}")
            print(f"   New Sale CSV files: {len(new_sale_files)}")
            print(f"   Resale CSV files: {len(resale_files)}")
            print(f"   Subsale CSV files: {len(subsale_files)}")
            print(f"   Total CSV files: {len(new_sale_files) + len(resale_files) + len(subsale_files)}")
        sys.exit(0)

    # === MAIN UPLOAD FLOW (requires advisory lock) ===

    with app.app_context():
        # Acquire advisory lock
        if not acquire_advisory_lock():
            print("\n❌ Another upload is already running. Exiting.")
            sys.exit(1)

        try:
            # Rollback mode
            if args.rollback:
                logger.stage("ROLLBACK")
                if not args.force:
                    response = input("\n⚠️  Are you sure you want to rollback? (yes/no): ")
                    if response.lower() != 'yes':
                        print("Rollback cancelled.")
                        exit_code = 0
                        raise SystemExit(exit_code)

                success = rollback_to_previous(logger)

                if success:
                    logger.stage("RECOMPUTE STATS")
                    # Preserve existing validation counts (we don't know counts for rolled-back data)
                    from services.data_computation import get_metadata
                    existing_metadata = get_metadata()
                    validation_results = {
                        'invalid_removed': existing_metadata.get('invalid_removed', 0),
                        'duplicates_removed': existing_metadata.get('duplicates_removed', 0),
                        'outliers_removed': existing_metadata.get('outliers_excluded', 0)
                    }
                    recompute_all_stats(validation_results)
                    exit_code = 0
                else:
                    exit_code = 1
                raise SystemExit(exit_code)

            # Publish-only mode
            if args.publish:
                logger.stage("PUBLISH ONLY")

                # Check staging exists
                staging_exists = db.session.execute(text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_name = :table_name
                    )
                """), {'table_name': STAGING_TABLE}).scalar()

                if not staging_exists:
                    print(f"\n❌ Staging table '{STAGING_TABLE}' does not exist.")
                    print("   Run without --publish first to load data to staging.")
                    exit_code = 1
                    raise SystemExit(exit_code)

                success, publish_stats = atomic_publish(logger)

                if success:
                    logger.stage("RECOMPUTE STATS")
                    # Preserve existing validation counts (staging validation happened in separate run)
                    from services.data_computation import get_metadata
                    existing_metadata = get_metadata()
                    validation_results = {
                        'invalid_removed': existing_metadata.get('invalid_removed', 0),
                        'duplicates_removed': existing_metadata.get('duplicates_removed', 0),
                        'outliers_removed': existing_metadata.get('outliers_excluded', 0)
                    }
                    recompute_all_stats(validation_results)
                    exit_code = 0
                else:
                    exit_code = 1

                # Print summary
                summary = logger.summary()
                print(f"\n📊 Run Summary: {json.dumps(summary, indent=2)}")
                raise SystemExit(exit_code)

            # === Full upload: Staging → Validate → Publish ===

            # Step B: Initialize RunContext for batch tracking
            run_ctx = None
            if RUN_CONTEXT_AVAILABLE:
                all_csv_files = new_sale_files + resale_files
                run_ctx = initialize_run_context(
                    all_csv_files,
                    contract_report=contract_report if 'contract_report' in dir() else None,
                    logger=logger
                )
                if run_ctx:
                    logger.log(f"Batch tracking enabled: {run_ctx.batch_id[:8]}...")
                    logger.log(f"  Schema: {run_ctx.schema_version} | Rules: {run_ctx.rules_version}")
                    ensure_etl_batches_table()
                    insert_batch_record(run_ctx, logger)
                    run_ctx.mark_stage('staging')

            # Step D: Get batch_id for batch-scoped operations
            # If --resume-batch is passed, use that batch_id instead of creating a new one
            if args.resume_batch:
                current_batch_id = args.resume_batch
                logger.log(f"Resuming batch: {current_batch_id[:8]}...")
            else:
                current_batch_id = run_ctx.batch_id if run_ctx else None

            # ==========================================================================
            # STAGING OWNERSHIP CHECK (Critical Safety Guardrail)
            # ==========================================================================
            # Prevents accidental data mixing from failed runs.
            # New run cannot append to existing staging by accident.
            staging_exists = db.session.execute(text(
                f"SELECT to_regclass('public.{STAGING_TABLE}') IS NOT NULL"
            )).scalar()

            if staging_exists and not args.clear_staging:
                # Get existing batch info
                existing_batches = db.session.execute(text(f"""
                    SELECT
                        batch_id,
                        COUNT(*) as row_count,
                        MIN(created_at)::text as first_row,
                        MAX(created_at)::text as last_row
                    FROM {STAGING_TABLE}
                    GROUP BY batch_id
                    ORDER BY MIN(created_at) DESC
                """)).fetchall()

                total_staging_rows = sum(b[1] for b in existing_batches)

                if total_staging_rows > 0:
                    # Check if resuming the same batch
                    existing_batch_ids = [str(b[0]) for b in existing_batches if b[0]]

                    if args.resume_batch:
                        # Verify the batch_id matches
                        if args.resume_batch not in existing_batch_ids:
                            logger.log(f"❌ BATCH MISMATCH: Cannot resume batch {args.resume_batch[:8]}...")
                            logger.log(f"   Staging contains different batch(es):")
                            for b in existing_batches:
                                bid = str(b[0])[:8] if b[0] else 'NULL'
                                logger.log(f"     - {bid}...: {b[1]:,} rows (created {b[2]})")
                            logger.log(f"")
                            logger.log(f"   Options:")
                            logger.log(f"   1. --clear-staging    Start fresh (discard existing data)")
                            logger.log(f"   2. --resume-batch {existing_batch_ids[0][:8]}   Resume the existing batch")
                            exit_code = 1
                            raise SystemExit(exit_code)
                        else:
                            logger.log(f"  ✓ Batch ownership verified: {args.resume_batch[:8]}...")
                            logger.log(f"    Existing rows in batch: {total_staging_rows:,}")
                    else:
                        # New batch but staging has data - ABORT
                        logger.log(f"❌ STAGING NOT EMPTY: Found {total_staging_rows:,} rows from previous run(s)")
                        logger.log(f"")
                        logger.log(f"   Existing batches in staging:")
                        for b in existing_batches:
                            bid = str(b[0])[:8] if b[0] else 'NULL'
                            logger.log(f"     - {bid}...: {b[1]:,} rows (created {b[2]})")
                        logger.log(f"")
                        logger.log(f"   This is a safety check to prevent accidental data mixing.")
                        logger.log(f"   You must explicitly choose:")
                        logger.log(f"")
                        logger.log(f"   Options:")
                        logger.log(f"   1. --clear-staging              Start fresh (discard existing data)")
                        if existing_batch_ids:
                            logger.log(f"   2. --resume-batch {existing_batch_ids[0]}   Resume the previous batch")
                        logger.log(f"")
                        exit_code = 1
                        raise SystemExit(exit_code)

            # Clear staging if requested (removes stale data from failed runs)
            if args.clear_staging:
                logger.log("Clearing staging table (--clear-staging flag)...")
                try:
                    # Use to_regclass for reliable schema-aware check
                    staging_exists = db.session.execute(text(
                        f"SELECT to_regclass('public.{STAGING_TABLE}') IS NOT NULL"
                    )).scalar()

                    if staging_exists:
                        stale_count = db.session.execute(text(f"SELECT COUNT(*) FROM {STAGING_TABLE}")).scalar()
                        # Use TRUNCATE (fast, keeps schema/indexes) instead of DROP CASCADE (dangerous)
                        db.session.execute(text(f"TRUNCATE TABLE {STAGING_TABLE} RESTART IDENTITY"))
                        db.session.commit()
                        logger.log(f"  Cleared {stale_count:,} stale rows from staging (TRUNCATE)")
                    else:
                        logger.log("  Staging table doesn't exist, nothing to clear")
                except Exception as e:
                    # Fail fast unless --force is also passed
                    if args.force:
                        logger.log(f"  Warning: Could not clear staging: {e} (continuing due to --force)")
                    else:
                        logger.log(f"  ❌ Failed to clear staging: {e}")
                        logger.log(f"     Use --force to continue anyway, or fix the issue first")
                        raise SystemExit(1)

            # STAGE 1: Create staging table
            logger.stage("CREATE STAGING TABLE")
            db.create_all()  # Ensure production schema exists
            create_staging_table(logger, batch_id=current_batch_id)

            # STAGE 2: Load CSV data to staging
            logger.stage("LOAD CSV TO STAGING")

            # Track reconciliation totals
            total_source_rows = 0
            total_loaded = 0
            total_rejected = 0
            total_skipped = 0

            # Process New Sale CSVs
            if new_sale_files:
                logger.log("Processing New Sale data...")
                for csv_path in new_sale_files:
                    result = insert_to_staging(csv_path, 'New Sale', logger, batch_id=current_batch_id)
                    total_source_rows += result['source_rows']
                    total_loaded += result['rows_loaded']
                    total_rejected += result['rows_rejected']
                    total_skipped += result['rows_skipped']
                    gc.collect()

            # Process Resale CSVs
            if resale_files:
                logger.log("Processing Resale data...")
                for csv_path in resale_files:
                    result = insert_to_staging(csv_path, 'Resale', logger, batch_id=current_batch_id)
                    total_source_rows += result['source_rows']
                    total_loaded += result['rows_loaded']
                    total_rejected += result['rows_rejected']
                    total_skipped += result['rows_skipped']
                    gc.collect()

            # Process Subsale CSVs
            if subsale_files:
                logger.log("Processing Subsale data...")
                for csv_path in subsale_files:
                    result = insert_to_staging(csv_path, 'Sub Sale', logger, batch_id=current_batch_id)
                    total_source_rows += result['source_rows']
                    total_loaded += result['rows_loaded']
                    total_rejected += result['rows_rejected']
                    total_skipped += result['rows_skipped']
                    gc.collect()

            if total_loaded == 0:
                logger.log("❌ All CSV files were empty or had no valid data.")
                exit_code = 1
                raise SystemExit(exit_code)

            # Log reconciliation summary
            logger.log(f"\n=== SOURCE RECONCILIATION ===")
            logger.log(f"Source rows:    {total_source_rows:,}")
            logger.log(f"Loaded:         {total_loaded:,}")
            logger.log(f"Rejected:       {total_rejected:,}")
            logger.log(f"Skipped:        {total_skipped:,}")
            unaccounted = total_source_rows - total_loaded - total_rejected - total_skipped
            if unaccounted == 0:
                logger.log(f"Unaccounted:    0  ✓")
            else:
                logger.log(f"Unaccounted:    {unaccounted:,}  ⚠️")

            # Step B: Update batch record after loading
            if run_ctx:
                run_ctx.source_row_count = total_source_rows
                run_ctx.rows_loaded = total_loaded
                run_ctx.rows_rejected = total_rejected
                run_ctx.rows_skipped = total_skipped
                update_batch_record(run_ctx, logger)

            # Use total_loaded for backward compatibility with rest of pipeline
            total_saved = total_loaded

            # STAGE 3: Deduplicate staging
            logger.stage("DEDUPLICATE STAGING")
            log_step(logger, "Running deduplication query...")
            duplicates_removed = remove_duplicates_staging(logger, batch_id=current_batch_id)

            # Step B: Update batch record after dedup
            if run_ctx:
                run_ctx.rows_after_dedup = total_saved - duplicates_removed
                run_ctx.mark_stage('validating')
                update_batch_record(run_ctx, logger)

            # STAGE 4: Remove outliers from staging
            logger.stage("REMOVE OUTLIERS")
            log_step(logger, "Calculating IQR bounds (PERCENTILE_CONT)...")
            outliers_removed, _ = filter_outliers_staging(logger, batch_id=current_batch_id)

            # Step B: Update batch record after outliers
            if run_ctx:
                run_ctx.rows_outliers_marked = outliers_removed

            # STAGE 5: Validate staging
            logger.stage("VALIDATE STAGING")
            if not args.skip_validation:
                is_valid, issues = validate_staging(logger, batch_id=current_batch_id)

                # Step B: Update batch record with validation results
                if run_ctx:
                    run_ctx.validation_passed = is_valid
                    if not is_valid:
                        for issue in issues:
                            run_ctx.add_validation_issue('staging_validation', issue)
                    update_batch_record(run_ctx, logger)

                if not is_valid:
                    # Step B: Mark batch as failed
                    if run_ctx:
                        run_ctx.fail('validation', 'Staging validation failed')
                        update_batch_record(run_ctx, logger)
                    logger.log("❌ Validation failed! Staging data not published.")
                    logger.log("   Fix the issues and re-run, or use --skip-validation")
                    exit_code = 1
                    raise SystemExit(exit_code)
            else:
                logger.log("⚠️  Skipping validation (--skip-validation)")
                if run_ctx:
                    run_ctx.validation_passed = True
                    run_ctx.add_semantic_warning('validation_skipped', 'Validation was skipped via --skip-validation')

            # Step F: Plan mode - generate report and exit without promoting
            if args.plan:
                logger.stage("PLAN MODE")
                logger.log("Generating plan report (no changes to production)...")

                plan_report = generate_plan_report(
                    logger=logger,
                    run_ctx=run_ctx,
                    batch_id=current_batch_id,
                    total_staged=total_saved,
                    duplicates_removed=duplicates_removed,
                    outliers_marked=outliers_removed,
                )
                print_plan_report(plan_report, logger)

                # Mark batch as plan-only (not promoted)
                if run_ctx:
                    run_ctx.status = 'plan_only'
                    run_ctx.add_semantic_warning('plan_mode', 'Run in --plan mode, no promotion')
                    update_batch_record(run_ctx, logger)

                logger.log("Plan mode complete. Staging data preserved for inspection.")
                logger.log(f"Staging table: {STAGING_TABLE}")
                exit_code = 0
                raise SystemExit(exit_code)

            # STAGE 6: Publish (unless staging-only)
            if args.staging_only:
                logger.log("Staging-only mode: Skipping publish")
                logger.log(f"Data is ready in '{STAGING_TABLE}' table")
                logger.log("Run with --publish to publish to production")
                # Step B: Mark batch as staging-only complete
                if run_ctx:
                    run_ctx.status = 'staging_complete'
                    update_batch_record(run_ctx, logger)
            else:
                logger.stage("ATOMIC PUBLISH")
                if run_ctx:
                    run_ctx.mark_stage('promoting')
                    update_batch_record(run_ctx, logger)

                success, publish_stats = atomic_publish(logger, batch_id=current_batch_id)

                if not success:
                    # Step B: Mark batch as failed
                    if run_ctx:
                        run_ctx.fail('promotion', 'Atomic publish failed')
                        update_batch_record(run_ctx, logger)
                    logger.log("❌ Publish failed!")
                    exit_code = 1
                    raise SystemExit(exit_code)

                # Step B/E: Record promoted row count and collision stats
                if run_ctx:
                    run_ctx.rows_promoted = publish_stats.get('rows_promoted', 0)
                    run_ctx.rows_skipped_collision = publish_stats.get('rows_skipped_collision', 0)

                # Verify schema has new columns
                schema_check = db.session.execute(text("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'transactions'
                    AND column_name IN ('street_name', 'floor_level', 'floor_range')
                """)).fetchall()
                new_cols = [r[0] for r in schema_check]
                if 'street_name' in new_cols:
                    logger.log(f"✓ Schema verified: new columns present ({', '.join(new_cols)})")
                else:
                    logger.log("⚠️  Warning: New columns not found in transactions table")

                # STAGE 7: Recompute stats
                logger.stage("RECOMPUTE STATS")
                validation_results = {
                    'duplicates_removed': duplicates_removed,
                    'outliers_removed': outliers_removed
                }
                recompute_all_stats(validation_results)

                # STAGE 8: Update project locations (optional)
                try:
                    from services.project_location_service import run_incremental_update
                    logger.stage("UPDATE PROJECT LOCATIONS")
                    run_incremental_update(app, geocode_limit=50)
                except ImportError:
                    logger.log("Project location update skipped (module not found)")
                except Exception as e:
                    logger.log(f"Project location update failed (non-critical): {e}")

                # STAGE 9: Cleanup new launch units CSV
                # Remove projects that now have resale transactions
                try:
                    from services.new_launch_units import cleanup_resale_projects
                    logger.stage("CLEANUP NEW LAUNCH UNITS")
                    cleanup_result = cleanup_resale_projects()
                    if cleanup_result.get('removed'):
                        logger.log(f"Removed {len(cleanup_result['removed'])} projects from new_launch_units.csv")
                        for project in cleanup_result['removed'][:5]:
                            logger.log(f"  - {project}")
                        if len(cleanup_result['removed']) > 5:
                            logger.log(f"  ... and {len(cleanup_result['removed']) - 5} more")
                    else:
                        logger.log("No projects to remove from new_launch_units.csv")
                    logger.log(f"Remaining new launch projects: {cleanup_result.get('remaining', 0)}")
                except ImportError:
                    logger.log("New launch cleanup skipped (module not found)")
                except Exception as e:
                    logger.log(f"New launch cleanup failed (non-critical): {e}")

            # Step B: Mark batch as complete
            if run_ctx:
                run_ctx.complete()
                update_batch_record(run_ctx, logger)
                logger.log(f"Batch {run_ctx.batch_id[:8]}... marked as complete")

            # Print summary
            summary = logger.summary()
            print(f"\n{'='*60}")
            print("✅ UPLOAD COMPLETE!")
            print(f"{'='*60}")
            print(f"Run ID: {run_id}")
            if run_ctx:
                print(f"Batch ID: {run_ctx.batch_id}")
            print(f"Total time: {summary['total_elapsed_seconds']:.1f} seconds")
            print(f"Stages completed: {len(summary['stages'])}")

        except SystemExit as e:
            # Controlled exit - extract exit code
            exit_code = e.code if isinstance(e.code, int) else 1
        except Exception as e:
            # Unexpected error
            # Step B: Mark batch as failed on unexpected error
            if 'run_ctx' in dir() and run_ctx:
                run_ctx.fail('unexpected', str(e)[:500])
                try:
                    update_batch_record(run_ctx, logger)
                except Exception:
                    pass  # Don't fail on failure to record failure
            logger.log(f"❌ Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            exit_code = 1
        finally:
            # ALWAYS cleanup: rollback any pending transaction, then release lock
            safe_release_advisory_lock()

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
