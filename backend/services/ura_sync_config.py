"""
URA Sync Configuration - Environment-based settings and kill switch

Environment Variables:
    URA_SYNC_ENABLED: 'true' or 'false' (default: 'true')
        Kill switch to disable sync. Set to 'false' to exit early.

    URA_SYNC_MODE: 'shadow' | 'production' | 'dry_run' (default: 'shadow')
        - shadow: Write to transactions with source='ura_api', run comparison
        - production: Full production write
        - dry_run: Fetch and map, but don't write to DB

    URA_REVISION_WINDOW_MONTHS: int (default: 3)
        Number of months to re-sync for revision catching

    URA_CUTOFF_YEARS: int (default: 5)
        Only sync transactions from the last N years
"""

import os
import logging
from datetime import date
from dateutil.relativedelta import relativedelta
from typing import Tuple, Optional

logger = logging.getLogger(__name__)


# =============================================================================
# Kill Switch
# =============================================================================

def is_sync_enabled() -> bool:
    """
    Check if URA sync is enabled.

    Returns:
        True if sync is enabled, False otherwise

    Environment:
        URA_SYNC_ENABLED: 'true' (default) or 'false'
    """
    enabled = os.environ.get('URA_SYNC_ENABLED', 'true').lower()
    if enabled in ('false', '0', 'no', 'off', 'disabled'):
        logger.warning("URA sync is DISABLED via URA_SYNC_ENABLED=false")
        return False
    return True


def get_sync_mode() -> str:
    """
    Get the current sync mode.

    Returns:
        'shadow', 'production', or 'dry_run'

    Environment:
        URA_SYNC_MODE: default 'shadow'
    """
    mode = os.environ.get('URA_SYNC_MODE', 'shadow').lower()
    if mode not in ('shadow', 'production', 'dry_run'):
        logger.warning(f"Invalid URA_SYNC_MODE '{mode}', defaulting to 'shadow'")
        mode = 'shadow'
    return mode


def get_revision_window_months() -> int:
    """
    Get the revision window in months.

    Returns:
        Number of months to re-sync (default: 3)

    Environment:
        URA_REVISION_WINDOW_MONTHS: default 3
    """
    try:
        return int(os.environ.get('URA_REVISION_WINDOW_MONTHS', '3'))
    except ValueError:
        return 3


def get_cutoff_date() -> date:
    """
    Calculate the cutoff date for syncing.

    Returns:
        Date N years ago (default: 5 years)

    Environment:
        URA_CUTOFF_YEARS: default 5
    """
    try:
        years = int(os.environ.get('URA_CUTOFF_YEARS', '5'))
    except ValueError:
        years = 5

    return date.today() - relativedelta(years=years)


# =============================================================================
# Property Type Filter
# =============================================================================

# Only sync these property types (excludes Executive Condominium)
# Stored in lowercase for case-insensitive matching
ALLOWED_PROPERTY_TYPES = frozenset(['condominium', 'apartment'])

# Display names for logging
ALLOWED_PROPERTY_TYPES_DISPLAY = ['Condominium', 'Apartment']


def is_allowed_property_type(property_type: str) -> bool:
    """
    Check if a property type should be synced (case-insensitive).

    Args:
        property_type: The property type string

    Returns:
        True if allowed, False if should be skipped (e.g., EC)

    Examples:
        >>> is_allowed_property_type('Condominium')
        True
        >>> is_allowed_property_type('condominium')
        True
        >>> is_allowed_property_type('Executive Condominium')
        False
    """
    if not property_type:
        return False
    return property_type.lower() in ALLOWED_PROPERTY_TYPES


def get_revision_window_date() -> date:
    """
    Calculate the date from which to start the revision window.

    Returns:
        Date N months ago

    Environment:
        URA_REVISION_WINDOW_MONTHS: default 3
    """
    months = get_revision_window_months()
    return date.today() - relativedelta(months=months)


# =============================================================================
# Upsert SQL Templates
# =============================================================================

# Fields that can be updated on conflict (URA may revise these)
UPDATABLE_FIELDS = [
    'price',
    'area_sqft',
    'psf',
    'floor_range',
    'sale_type',
    'district',
    'nett_price',
    'floor_level',
    'bedroom_count',
    'tenure',
    'lease_start_year',
    'remaining_lease',
    'num_units',
    'type_of_area',
    'market_segment',
    'ingested_at',
    'run_id',
]

# All fields for INSERT
INSERT_FIELDS = [
    'project_name',
    'transaction_date',
    'transaction_month',
    'contract_date',
    'price',
    'area_sqft',
    'psf',
    'district',
    'bedroom_count',
    'property_type',
    'sale_type',
    'tenure',
    'lease_start_year',
    'remaining_lease',
    'street_name',
    'floor_range',
    'floor_level',
    'num_units',
    'nett_price',
    'type_of_area',
    'market_segment',
    'source',
    'run_id',
    'ingested_at',
    'row_hash',
    'raw_extras',
]


def build_upsert_sql() -> str:
    """
    Build the upsert SQL statement with ON CONFLICT DO UPDATE.

    The statement:
    1. Attempts INSERT
    2. On conflict with row_hash, UPDATE the updatable fields
    3. Returns whether the row was inserted or updated

    Returns:
        SQL string with :named_param placeholders
    """
    # Build INSERT columns and values
    columns = ', '.join(INSERT_FIELDS)
    values = ', '.join(f':{f}' for f in INSERT_FIELDS)

    # Build UPDATE SET clause for updatable fields
    update_set = ', '.join(
        f'{f} = EXCLUDED.{f}'
        for f in UPDATABLE_FIELDS
    )

    sql = f"""
    INSERT INTO transactions ({columns})
    VALUES ({values})
    ON CONFLICT (row_hash) WHERE row_hash IS NOT NULL
    DO UPDATE SET {update_set}
    RETURNING
        id,
        (xmax = 0) as was_inserted
    """

    return sql


def build_batch_upsert_sql(batch_size: int) -> str:
    """
    Build SQL for batch upsert using VALUES clause.

    Args:
        batch_size: Number of rows in the batch

    Returns:
        SQL string for batch upsert
    """
    # This is more complex - for now, use individual upserts with executemany
    # Could optimize later with psycopg2.extras.execute_values
    return build_upsert_sql()


# =============================================================================
# Sync Result Tracking
# =============================================================================

class SyncStats:
    """Track sync statistics."""

    def __init__(self):
        self.raw_projects = 0
        self.raw_transactions = 0
        self.mapped_rows = 0
        self.inserted_rows = 0
        self.updated_rows = 0
        self.unchanged_rows = 0
        self.failed_rows = 0
        self.skip_counters = {}

    def to_dict(self) -> dict:
        """Convert to dict for storage."""
        return {
            'raw_projects': self.raw_projects,
            'raw_transactions': self.raw_transactions,
            'mapped_rows': self.mapped_rows,
            'inserted_rows': self.inserted_rows,
            'updated_rows': self.updated_rows,
            'unchanged_rows': self.unchanged_rows,
            'failed_rows': self.failed_rows,
        }

    def add_mapper_stats(self, mapper_stats: dict):
        """Add stats from mapper."""
        self.skip_counters = {
            k: v for k, v in mapper_stats.items()
            if k.startswith('skip_')
        }


# =============================================================================
# Validation
# =============================================================================

def validate_sync_config() -> Tuple[bool, Optional[str]]:
    """
    Validate sync configuration before starting.

    Returns:
        (is_valid, error_message)
    """
    if not is_sync_enabled():
        return False, "Sync disabled via URA_SYNC_ENABLED"

    mode = get_sync_mode()
    logger.info(f"URA sync mode: {mode}")
    logger.info(f"Revision window: {get_revision_window_months()} months")
    logger.info(f"Cutoff date: {get_cutoff_date()}")

    # Check URA_ACCESS_KEY is set
    if not os.environ.get('URA_ACCESS_KEY'):
        return False, "URA_ACCESS_KEY environment variable not set"

    return True, None


def log_sync_config():
    """Log current sync configuration."""
    logger.info("=" * 60)
    logger.info("URA Sync Configuration")
    logger.info("=" * 60)
    logger.info(f"  Enabled:          {is_sync_enabled()}")
    logger.info(f"  Mode:             {get_sync_mode()}")
    logger.info(f"  Revision window:  {get_revision_window_months()} months")
    logger.info(f"  Revision start:   {get_revision_window_date()}")
    logger.info(f"  Cutoff date:      {get_cutoff_date()}")
    logger.info("=" * 60)
