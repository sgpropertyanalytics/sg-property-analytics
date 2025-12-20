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

CRITICAL: This script preserves ALL CSV columns end-to-end.
"""

import sys
import os
import gc
import re
import argparse
import uuid
import json
from datetime import datetime
from typing import Set, List, Tuple, Dict, Any, Optional

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from sqlalchemy import text, inspect
from config import Config
from models.database import db
from models.transaction import Transaction
from services.data_loader import clean_csv_data, parse_date_flexible
from services.data_computation import recompute_all_stats
import pandas as pd


# === Constants ===
ADVISORY_LOCK_ID = 12345  # Unique lock ID for upload process
STAGING_TABLE = 'transactions_staging'
PRODUCTION_TABLE = 'transactions'
PREVIOUS_TABLE = 'transactions_prev'

EXPECTED_CSV_COLUMNS = {
    'Project Name', 'Street Name', 'Property Type', 'Postal District',
    'Market Segment', 'Tenure', 'Type of Sale', 'No. of Units',
    'Nett Price ($)', 'Transacted Price ($)', 'Area (SQFT)',
    'Type of Area', 'Unit Price ($ PSF)', 'Sale Date', 'Floor Range',
}

CSV_TO_DB_MAPPING = {
    'Project Name': 'project_name',
    'Street Name': 'street_name',
    'Property Type': 'property_type',
    'Postal District': 'district',
    'Market Segment': 'market_segment',
    'Tenure': 'tenure',
    'Type of Sale': 'sale_type',
    'No. of Units': 'num_units',
    'Nett Price ($)': 'nett_price',
    'Transacted Price ($)': 'price',
    'Area (SQFT)': 'area_sqft',
    'Type of Area': 'type_of_area',
    'Unit Price ($ PSF)': 'psf',
    'Sale Date': 'transaction_date',
    'Floor Range': 'floor_range',
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
    for folder in ['New Sale', 'Resale']:
        folder_path = os.path.join(rawdata_path, folder)
        if os.path.exists(folder_path):
            for f in os.listdir(folder_path):
                if f.endswith('.csv'):
                    return os.path.join(folder_path, f)
    return None


def _safe_str(value, default='') -> str:
    """Safely convert a value to string, handling NaN/None."""
    if pd.isna(value) or value is None:
        return default
    return str(value).strip() if str(value).strip() != 'nan' else default


def _safe_float(value, default=0.0) -> float:
    """Safely convert a value to float, handling NaN/None."""
    if pd.isna(value) or value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def _safe_int(value, default=None):
    """Safely convert a value to int, handling NaN/None."""
    if pd.isna(value) or value is None:
        return default
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return default


def _parse_lease_info(tenure_str: str, current_year: int):
    """Parse lease start year and remaining lease from tenure string."""
    if not tenure_str or tenure_str == 'nan':
        return None, None

    tenure_str = str(tenure_str)

    if "freehold" in tenure_str.lower() or "estate in perpetuity" in tenure_str.lower():
        return None, 999

    lease_start_year = None
    remaining_lease = None

    match = re.search(r"(?:from|commencing)\s+(\d{4})", tenure_str.lower())
    if match:
        try:
            year = int(match.group(1))
            lease_start_year = year
            remaining_lease = 99 - (current_year - year)
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
                remaining_lease = 99 - (current_year - year)
                if remaining_lease < 0:
                    remaining_lease = 0
            except ValueError:
                pass

    return lease_start_year, remaining_lease


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

def create_staging_table(logger: UploadLogger):
    """Create staging table as a copy of production schema."""
    logger.log("Creating staging table...")

    # Drop existing staging table if exists
    db.session.execute(text(f"DROP TABLE IF EXISTS {STAGING_TABLE} CASCADE"))

    # Create staging table with same schema as transactions
    db.session.execute(text(f"""
        CREATE TABLE {STAGING_TABLE} (
            id SERIAL PRIMARY KEY,
            project_name VARCHAR(255) NOT NULL,
            transaction_date DATE NOT NULL,
            contract_date VARCHAR(10),
            price FLOAT NOT NULL,
            area_sqft FLOAT NOT NULL,
            psf FLOAT NOT NULL,
            district VARCHAR(10) NOT NULL,
            bedroom_count INTEGER NOT NULL,
            property_type VARCHAR(100) DEFAULT 'Condominium',
            sale_type VARCHAR(50),
            tenure TEXT,
            lease_start_year INTEGER,
            remaining_lease INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            street_name TEXT,
            floor_range VARCHAR(20),
            floor_level VARCHAR(20),
            num_units INTEGER,
            nett_price FLOAT,
            type_of_area VARCHAR(20),
            market_segment VARCHAR(10)
        )
    """))
    db.session.commit()
    logger.log("✓ Staging table created")


def insert_to_staging(csv_path: str, sale_type: str, logger: UploadLogger) -> int:
    """
    Process a single CSV file and insert into staging table.
    Returns count of rows saved.
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
            return 0

        original_cols = len(df.columns)
        df = clean_csv_data(df)

        if df.empty:
            logger.log(f"  ⚠️  No valid data after cleaning")
            return 0

        df['sale_type'] = sale_type

        # Insert in batches using raw SQL for staging table
        batch_size = 500
        total_rows = len(df)
        saved = 0
        current_year = datetime.now().year

        for idx in range(0, total_rows, batch_size):
            batch = df.iloc[idx:idx+batch_size]
            values = []

            for _, row in batch.iterrows():
                try:
                    transaction_date = None
                    if 'transaction_date' in row and pd.notna(row['transaction_date']):
                        if isinstance(row['transaction_date'], str):
                            try:
                                transaction_date = pd.to_datetime(row['transaction_date']).date()
                            except:
                                year, month = parse_date_flexible(row['transaction_date'])
                                if year and month:
                                    from datetime import date
                                    transaction_date = date(year, month, 1)
                        elif hasattr(row['transaction_date'], 'date'):
                            transaction_date = row['transaction_date'].date()

                    tenure_str = _safe_str(row.get('tenure') or row.get('Tenure'))
                    lease_start_year, remaining_lease = _parse_lease_info(tenure_str, current_year)

                    project_name = _safe_str(row.get('project_name') or row.get('Project Name'), default='')
                    property_type = _safe_str(row.get('property_type') or row.get('Property Type'), default='Condominium')

                    values.append({
                        'project_name': project_name,
                        'transaction_date': transaction_date,
                        'contract_date': _safe_str(row.get('contract_date')),
                        'price': _safe_float(row.get('price')),
                        'area_sqft': _safe_float(row.get('area_sqft')),
                        'psf': _safe_float(row.get('psf')),
                        'district': _safe_str(row.get('district')),
                        'bedroom_count': _safe_int(row.get('bedroom_count'), default=1),
                        'property_type': property_type,
                        'sale_type': _safe_str(row.get('sale_type')),
                        'tenure': tenure_str if tenure_str else None,
                        'lease_start_year': lease_start_year,
                        'remaining_lease': remaining_lease,
                        'street_name': _safe_str(row.get('street_name')) or None,
                        'floor_range': _safe_str(row.get('floor_range')) or None,
                        'floor_level': _safe_str(row.get('floor_level')) or None,
                        'num_units': _safe_int(row.get('num_units')),
                        'nett_price': _safe_float(row.get('nett_price')) if row.get('nett_price') else None,
                        'type_of_area': _safe_str(row.get('type_of_area')) or None,
                        'market_segment': _safe_str(row.get('market_segment')) or None,
                    })
                except Exception:
                    continue

            if values:
                # Bulk insert into staging
                db.session.execute(
                    text(f"""
                        INSERT INTO {STAGING_TABLE} (
                            project_name, transaction_date, contract_date, price, area_sqft,
                            psf, district, bedroom_count, property_type, sale_type,
                            tenure, lease_start_year, remaining_lease, street_name,
                            floor_range, floor_level, num_units, nett_price, type_of_area,
                            market_segment
                        ) VALUES (
                            :project_name, :transaction_date, :contract_date, :price, :area_sqft,
                            :psf, :district, :bedroom_count, :property_type, :sale_type,
                            :tenure, :lease_start_year, :remaining_lease, :street_name,
                            :floor_range, :floor_level, :num_units, :nett_price, :type_of_area,
                            :market_segment
                        )
                    """),
                    values
                )
                db.session.commit()
                saved += len(values)

        logger.log(f"  ✓ Saved {saved:,} rows (from {original_cols} CSV columns)")

        del df
        gc.collect()
        return saved

    except Exception as e:
        logger.log(f"  ⚠️  Error: {e}")
        import traceback
        traceback.print_exc()
        return 0


# =============================================================================
# VALIDATION ON STAGING
# =============================================================================

def remove_duplicates_staging(logger: UploadLogger) -> int:
    """Remove duplicates from staging table."""
    before = db.session.execute(text(f"SELECT COUNT(*) FROM {STAGING_TABLE}")).scalar()

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


def filter_outliers_staging(logger: UploadLogger) -> Tuple[int, Dict]:
    """
    Remove outliers from staging using GLOBAL IQR method.

    Uses global IQR (across all transactions) to catch extreme outliers
    like $890M transactions that would skew the price distribution chart.
    This matches the original filter_outliers_sql behavior.
    """
    before = db.session.execute(text(f"SELECT COUNT(*) FROM {STAGING_TABLE}")).scalar()

    # Calculate GLOBAL IQR bounds (across all transactions)
    # This catches extreme outliers that per-group IQR would miss
    result = db.session.execute(text(f"""
        SELECT
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price) as q1,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price) as q3
        FROM {STAGING_TABLE}
        WHERE price > 0
    """)).fetchone()

    if not result or not result.q1 or not result.q3:
        logger.log("⚠️  Could not calculate IQR bounds")
        return 0, {'before': before, 'after': before}

    q1, q3 = float(result.q1), float(result.q3)
    iqr = q3 - q1
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr

    logger.log(f"  Global IQR bounds: Q1=${q1:,.0f}, Q3=${q3:,.0f}, IQR=${iqr:,.0f}")
    logger.log(f"  Valid range: ${lower_bound:,.0f} - ${upper_bound:,.0f}")

    # Delete outliers outside global bounds
    deleted = db.session.execute(text(f"""
        DELETE FROM {STAGING_TABLE}
        WHERE price < :lower_bound OR price > :upper_bound
    """), {'lower_bound': lower_bound, 'upper_bound': upper_bound})

    total_removed = deleted.rowcount
    db.session.commit()

    after = db.session.execute(text(f"SELECT COUNT(*) FROM {STAGING_TABLE}")).scalar()
    logger.log(f"✓ Removed {total_removed:,} outliers from staging (global IQR)")

    return total_removed, {
        'before': before,
        'after': after,
        'q1': q1,
        'q3': q3,
        'iqr': iqr,
        'lower_bound': lower_bound,
        'upper_bound': upper_bound
    }


def validate_staging(logger: UploadLogger) -> Tuple[bool, List[str]]:
    """
    Run validation checks on staging table.
    Returns (is_valid, list_of_issues).
    """
    logger.log("Running validation checks on staging data...")
    issues = []

    # 1. Row count check
    row_count = db.session.execute(text(f"SELECT COUNT(*) FROM {STAGING_TABLE}")).scalar()
    logger.log(f"  Row count: {row_count:,}")

    if row_count < VALIDATION_CONFIG['min_row_count']:
        issues.append(f"Row count {row_count} below minimum {VALIDATION_CONFIG['min_row_count']}")

    # 2. Null rate checks for required columns
    for column, max_rate in VALIDATION_CONFIG['max_null_rate'].items():
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
    district_counts = db.session.execute(text(f"""
        SELECT district, COUNT(*) as cnt FROM {STAGING_TABLE}
        GROUP BY district ORDER BY cnt DESC LIMIT 5
    """)).fetchall()
    logger.log(f"  Top districts: {[(d.district, d.cnt) for d in district_counts]}")

    # 6. Date range check
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

def atomic_publish(logger: UploadLogger) -> bool:
    """
    Atomically swap staging table to production.
    Uses PostgreSQL table rename in a single transaction.

    Steps:
    1. Drop transactions_prev if exists (from previous run)
    2. Rename transactions → transactions_prev
    3. Rename transactions_staging → transactions
    4. Recreate indexes on new transactions table

    Returns True on success.
    """
    logger.log("Starting atomic publish...")

    try:
        # Check if staging table exists and has data
        staging_count = db.session.execute(
            text(f"SELECT COUNT(*) FROM {STAGING_TABLE}")
        ).scalar()

        if staging_count == 0:
            logger.log("❌ Staging table is empty, cannot publish")
            return False

        # Check if production table exists
        prod_exists = db.session.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = :table_name
            )
        """), {'table_name': PRODUCTION_TABLE}).scalar()

        # Execute swap in a single transaction
        logger.log("Executing table swap...")

        if prod_exists:
            # Drop previous backup if exists
            db.session.execute(text(f"DROP TABLE IF EXISTS {PREVIOUS_TABLE} CASCADE"))

            # Rename current production to prev
            db.session.execute(text(f"ALTER TABLE {PRODUCTION_TABLE} RENAME TO {PREVIOUS_TABLE}"))
            logger.log(f"  ✓ {PRODUCTION_TABLE} → {PREVIOUS_TABLE}")

        # Rename staging to production
        db.session.execute(text(f"ALTER TABLE {STAGING_TABLE} RENAME TO {PRODUCTION_TABLE}"))
        logger.log(f"  ✓ {STAGING_TABLE} → {PRODUCTION_TABLE}")

        # Recreate indexes
        logger.log("Recreating indexes...")
        db.session.execute(text(f"""
            CREATE INDEX IF NOT EXISTS ix_transactions_project_name ON {PRODUCTION_TABLE}(project_name);
            CREATE INDEX IF NOT EXISTS ix_transactions_transaction_date ON {PRODUCTION_TABLE}(transaction_date);
            CREATE INDEX IF NOT EXISTS ix_transactions_district ON {PRODUCTION_TABLE}(district);
            CREATE INDEX IF NOT EXISTS ix_transactions_bedroom_count ON {PRODUCTION_TABLE}(bedroom_count);
            CREATE INDEX IF NOT EXISTS ix_transactions_floor_level ON {PRODUCTION_TABLE}(floor_level);
        """))

        db.session.commit()
        logger.log("✅ Atomic publish complete!")

        # Log final counts
        new_count = db.session.execute(
            text(f"SELECT COUNT(*) FROM {PRODUCTION_TABLE}")
        ).scalar()
        logger.log(f"  Production table now has {new_count:,} rows")

        if prod_exists:
            prev_count = db.session.execute(
                text(f"SELECT COUNT(*) FROM {PREVIOUS_TABLE}")
            ).scalar()
            logger.log(f"  Previous version ({PREVIOUS_TABLE}) has {prev_count:,} rows")

        return True

    except Exception as e:
        db.session.rollback()
        logger.log(f"❌ Publish failed: {e}")
        import traceback
        traceback.print_exc()
        return False


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
# MAIN ENTRY POINT
# =============================================================================

def discover_csv_files(csv_folder: str) -> Tuple[List[str], List[str]]:
    """
    Discover CSV files BEFORE any database operations.

    Returns:
        Tuple of (new_sale_files, resale_files)
    """
    new_sale_files = []
    resale_files = []

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

    return new_sale_files, resale_files


def safe_release_advisory_lock():
    """
    Safely release advisory lock with proper transaction handling.

    Must rollback any failed transaction first, then release lock.
    """
    try:
        # Always rollback first to ensure clean transaction state
        db.session.rollback()
        # Now safe to release lock
        db.session.execute(text(f"SELECT pg_advisory_unlock({ADVISORY_LOCK_ID})"))
        db.session.commit()
    except Exception as e:
        # Log but don't raise - cleanup should not fail the script
        print(f"   Warning: Advisory lock release failed: {e}")


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
        new_sale_files, resale_files = discover_csv_files(csv_folder)
        total_csv_files = len(new_sale_files) + len(resale_files)

        if total_csv_files == 0 and not args.dry_run:
            print(f"\n❌ No CSV files found in {csv_folder}")
            print(f"   Expected: rawdata/New Sale/*.csv and/or rawdata/Resale/*.csv")
            sys.exit(1)

        print(f"\n📂 Found {total_csv_files} CSV files")
        print(f"   New Sale: {len(new_sale_files)} files")
        print(f"   Resale: {len(resale_files)} files")

    app = create_app()

    # Print database connection info for verification
    with app.app_context():
        db_info = db.session.execute(text(
            "SELECT current_database(), inet_server_addr(), inet_server_port()"
        )).fetchone()
        print(f"\n🔗 Database Connection:")
        print(f"   Database: {db_info[0]}")
        print(f"   Host: {db_info[1] or 'localhost'}")
        print(f"   Port: {db_info[2] or 5432}")

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

            new_sale_files, resale_files = discover_csv_files(csv_folder)

            print(f"\n📂 DRY RUN - No changes will be made")
            print(f"   Current production rows: {existing_count:,}")
            print(f"   New Sale CSV files: {len(new_sale_files)}")
            print(f"   Resale CSV files: {len(resale_files)}")
            print(f"   Total CSV files: {len(new_sale_files) + len(resale_files)}")
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
                    recompute_all_stats()
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

                success = atomic_publish(logger)

                if success:
                    logger.stage("RECOMPUTE STATS")
                    recompute_all_stats()
                    exit_code = 0
                else:
                    exit_code = 1

                # Print summary
                summary = logger.summary()
                print(f"\n📊 Run Summary: {json.dumps(summary, indent=2)}")
                raise SystemExit(exit_code)

            # === Full upload: Staging → Validate → Publish ===

            # STAGE 1: Create staging table
            logger.stage("CREATE STAGING TABLE")
            db.create_all()  # Ensure production schema exists
            create_staging_table(logger)

            # STAGE 2: Load CSV data to staging
            logger.stage("LOAD CSV TO STAGING")

            total_saved = 0

            # Process New Sale CSVs
            if new_sale_files:
                logger.log("Processing New Sale data...")
                for csv_path in new_sale_files:
                    saved = insert_to_staging(csv_path, 'New Sale', logger)
                    total_saved += saved
                    gc.collect()

            # Process Resale CSVs
            if resale_files:
                logger.log("Processing Resale data...")
                for csv_path in resale_files:
                    saved = insert_to_staging(csv_path, 'Resale', logger)
                    total_saved += saved
                    gc.collect()

            if total_saved == 0:
                logger.log("❌ All CSV files were empty or had no valid data.")
                exit_code = 1
                raise SystemExit(exit_code)

            logger.log(f"Total rows loaded to staging: {total_saved:,}")

            # STAGE 3: Deduplicate staging
            logger.stage("DEDUPLICATE STAGING")
            duplicates_removed = remove_duplicates_staging(logger)

            # STAGE 4: Remove outliers from staging
            logger.stage("REMOVE OUTLIERS")
            outliers_removed, _ = filter_outliers_staging(logger)

            # STAGE 5: Validate staging
            logger.stage("VALIDATE STAGING")
            if not args.skip_validation:
                is_valid, issues = validate_staging(logger)

                if not is_valid:
                    logger.log("❌ Validation failed! Staging data not published.")
                    logger.log("   Fix the issues and re-run, or use --skip-validation")
                    exit_code = 1
                    raise SystemExit(exit_code)
            else:
                logger.log("⚠️  Skipping validation (--skip-validation)")

            # STAGE 6: Publish (unless staging-only)
            if args.staging_only:
                logger.log("Staging-only mode: Skipping publish")
                logger.log(f"Data is ready in '{STAGING_TABLE}' table")
                logger.log("Run with --publish to publish to production")
            else:
                logger.stage("ATOMIC PUBLISH")
                success = atomic_publish(logger)

                if not success:
                    logger.log("❌ Publish failed!")
                    exit_code = 1
                    raise SystemExit(exit_code)

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
                recompute_all_stats()

                # STAGE 8: Update project locations (optional)
                try:
                    from services.project_location_service import run_incremental_update
                    logger.stage("UPDATE PROJECT LOCATIONS")
                    run_incremental_update(app, geocode_limit=50)
                except ImportError:
                    logger.log("Project location update skipped (module not found)")
                except Exception as e:
                    logger.log(f"Project location update failed (non-critical): {e}")

            # Print summary
            summary = logger.summary()
            print(f"\n{'='*60}")
            print("✅ UPLOAD COMPLETE!")
            print(f"{'='*60}")
            print(f"Run ID: {run_id}")
            print(f"Total time: {summary['total_elapsed_seconds']:.1f} seconds")
            print(f"Stages completed: {len(summary['stages'])}")

        except SystemExit as e:
            # Controlled exit - extract exit code
            exit_code = e.code if isinstance(e.code, int) else 1
        except Exception as e:
            # Unexpected error
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
