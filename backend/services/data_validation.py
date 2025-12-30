"""
Data Validation Service - Centralized data filtering, cleaning, and validation

This module contains all functions related to:
- Outlier detection and filtering (IQR method)
- Data deduplication
- Data quality validation

All filtering happens BEFORE data is stored in the master database,
ensuring clean data for downstream computation.

Pipeline: Load Raw → Validate/Filter/Clean → Store in DB → Compute Stats
"""

from typing import Tuple, Dict, Any, List, Optional
from sqlalchemy import text
from models.database import db
from models.transaction import Transaction
from db.sql import OUTLIER_FILTER, exclude_outliers

# IQR multiplier for outlier detection - MUST match scripts/upload.py
# Relaxed from standard 1.5x to 5.0x to include luxury condos
IQR_MULTIPLIER = 5.0


def calculate_iqr_bounds(column: str = 'price') -> Tuple[float, float, Dict[str, float]]:
    """
    Calculate IQR bounds for outlier detection using SQL.

    Only includes non-outlier records in the calculation to prevent
    already-identified outliers from skewing the bounds.

    Args:
        column: Column name to calculate IQR for (default: 'price')

    Returns:
        Tuple of (lower_bound, upper_bound, statistics_dict)
        statistics_dict contains: q1, q3, iqr, lower_bound, upper_bound
    """
    # PostgreSQL percentile function (SQLite not supported)
    # Exclude already-marked outliers from calculation
    quartile_sql = text(f"""
        SELECT
            percentile_cont(0.25) WITHIN GROUP (ORDER BY {column}) as q1,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY {column}) as q3
        FROM transactions
        WHERE {column} > 0
        AND {OUTLIER_FILTER}
    """)
    result = db.session.execute(quartile_sql).fetchone()
    q1, q3 = float(result[0]), float(result[1])

    iqr = q3 - q1
    lower_bound = q1 - IQR_MULTIPLIER * iqr
    upper_bound = q3 + IQR_MULTIPLIER * iqr

    stats = {
        'q1': q1,
        'q3': q3,
        'iqr': iqr,
        'lower_bound': lower_bound,
        'upper_bound': upper_bound
    }

    return lower_bound, upper_bound, stats


def count_outliers(lower_bound: float, upper_bound: float, column: str = 'price') -> int:
    """
    Count records that fall outside the IQR bounds (excluding already-marked outliers).

    Args:
        lower_bound: Lower bound for valid data
        upper_bound: Upper bound for valid data
        column: Column to check (default: 'price')

    Returns:
        Count of potential new outlier records
    """
    count_sql = text(f"""
        SELECT COUNT(*) FROM transactions
        WHERE ({column} < :lower_bound OR {column} > :upper_bound)
        AND {OUTLIER_FILTER}
    """)
    return db.session.execute(
        count_sql,
        {'lower_bound': lower_bound, 'upper_bound': upper_bound}
    ).scalar()


def filter_outliers_sql(column: str = 'price', dry_run: bool = False) -> Tuple[int, Dict[str, Any]]:
    """
    Mark outliers in database using SQL-based IQR calculation (soft-delete).

    This is the main outlier filtering function. It:
    1. Calculates IQR bounds
    2. Identifies outliers
    3. Marks them with is_outlier=True (soft-delete, not hard-delete)

    Outliers are kept in the database for audit purposes but excluded from
    analytics queries via WHERE is_outlier = false.

    Args:
        column: Column to filter outliers on (default: 'price')
        dry_run: If True, only preview without marking

    Returns:
        Tuple of (outliers_marked_count, statistics_dict)
    """
    # Count non-outlier records
    before_count = db.session.query(Transaction).filter(
        exclude_outliers(Transaction)
    ).count()

    # Calculate bounds (only from non-outlier records)
    lower_bound, upper_bound, stats = calculate_iqr_bounds(column)

    # Count potential new outliers (records not yet marked)
    count_sql = text(f"""
        SELECT COUNT(*) FROM transactions
        WHERE ({column} < :lower_bound OR {column} > :upper_bound)
        AND {OUTLIER_FILTER}
    """)
    outlier_count = db.session.execute(
        count_sql,
        {'lower_bound': lower_bound, 'upper_bound': upper_bound}
    ).scalar()

    stats['before_count'] = before_count
    stats['outlier_count'] = outlier_count

    if dry_run or outlier_count == 0:
        stats['action'] = 'preview' if dry_run else 'none'
        stats['outliers_marked'] = 0
        return 0, stats

    # Mark outliers with is_outlier=True (soft-delete)
    mark_sql = text(f"""
        UPDATE transactions
        SET is_outlier = true
        WHERE ({column} < :lower_bound OR {column} > :upper_bound)
        AND {OUTLIER_FILTER}
    """)
    result = db.session.execute(mark_sql, {'lower_bound': lower_bound, 'upper_bound': upper_bound})
    db.session.commit()

    outliers_marked = result.rowcount

    # Count remaining non-outlier records
    after_count = db.session.query(Transaction).filter(
        exclude_outliers(Transaction)
    ).count()

    stats['action'] = 'marked'
    stats['outliers_marked'] = outliers_marked
    stats['outliers_removed'] = outliers_marked  # Backward compatibility
    stats['after_count'] = after_count

    return outliers_marked, stats


def get_outlier_count() -> int:
    """
    Get count of records currently marked as outliers.

    Returns:
        Count of is_outlier=True records
    """
    return db.session.query(Transaction).filter(
        Transaction.is_outlier == True
    ).count()


def unmark_outliers() -> int:
    """
    Remove outlier flag from all records (for recalculation).

    Returns:
        Count of records unmarked
    """
    result = db.session.execute(text("""
        UPDATE transactions SET is_outlier = false WHERE is_outlier = true
    """))
    db.session.commit()
    return result.rowcount


def remove_duplicates_sql() -> int:
    """
    Remove duplicate transactions using SQL.

    Duplicates are identified by matching:
    - project_name
    - transaction_date
    - price
    - area_sqft
    - floor_range (always included with COALESCE to handle NULLs)

    Keeps the first occurrence (lowest ID) of each duplicate set.

    IMPORTANT: floor_range MUST be included in deduplication key to avoid
    incorrectly removing legitimate transactions on different floors with
    the same project, date, price, and area. (Issue B3 in audit)

    Returns:
        Count of duplicates removed
    """
    before_count = db.session.query(Transaction).count()

    # Always try to use floor_range with COALESCE (handles NULLs properly)
    # Only fall back to simpler query if column doesn't exist in old schemas
    sql_with_floor = text("""
        DELETE FROM transactions
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM transactions
            GROUP BY project_name, transaction_date, price, area_sqft,
                     COALESCE(floor_range, '')
        )
    """)

    sql_without_floor = text("""
        DELETE FROM transactions
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM transactions
            GROUP BY project_name, transaction_date, price, area_sqft
        )
    """)

    try:
        # First, try with floor_range (preferred - more accurate deduplication)
        db.session.execute(sql_with_floor)
        db.session.commit()
        after_count = db.session.query(Transaction).count()
        return before_count - after_count
    except Exception as e:
        # If floor_range column doesn't exist, fall back to simpler query
        db.session.rollback()
        if 'floor_range' in str(e).lower() or 'column' in str(e).lower():
            try:
                db.session.execute(sql_without_floor)
                db.session.commit()
                after_count = db.session.query(Transaction).count()
                return before_count - after_count
            except Exception as e2:
                db.session.rollback()
                raise e2
        raise e


def validate_transaction_data(data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Validate a single transaction record before insertion.

    Args:
        data: Dictionary of transaction fields

    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    errors = []

    # Required fields
    if not data.get('price') or data['price'] <= 0:
        errors.append("Price must be positive")

    if not data.get('area_sqft') or data['area_sqft'] <= 0:
        errors.append("Area must be positive")

    if not data.get('district'):
        errors.append("District is required")

    # PSF validation (should be reasonable)
    if data.get('psf'):
        if data['psf'] < 100 or data['psf'] > 50000:
            errors.append(f"PSF {data['psf']} seems unrealistic")

    # Bedroom count validation
    if data.get('bedroom_count'):
        if data['bedroom_count'] < 1 or data['bedroom_count'] > 10:
            errors.append(f"Bedroom count {data['bedroom_count']} seems unrealistic")

    return len(errors) == 0, errors


def print_iqr_statistics(stats: Dict[str, float]) -> None:
    """Print IQR statistics in a formatted way."""
    print(f"  📊 IQR Statistics:")
    print(f"     Q1 (25th percentile): ${stats['q1']:,.0f}")
    print(f"     Q3 (75th percentile): ${stats['q3']:,.0f}")
    print(f"     IQR: ${stats['iqr']:,.0f}")
    print(f"     Lower bound (Q1 - 1.5*IQR): ${stats['lower_bound']:,.0f}")
    print(f"     Upper bound (Q3 + 1.5*IQR): ${stats['upper_bound']:,.0f}")


def remove_invalid_records() -> int:
    """
    Remove records with invalid/corrupted data.

    Removes records where:
    - price <= 0 or NULL
    - area_sqft <= 0 or NULL
    - psf <= 0 or NULL
    - transaction_date is NULL

    Returns:
        Count of invalid records removed
    """
    before_count = db.session.query(Transaction).count()

    # Remove records with invalid price
    sql = text("""
        DELETE FROM transactions
        WHERE price IS NULL OR price <= 0
           OR area_sqft IS NULL OR area_sqft <= 0
           OR psf IS NULL OR psf <= 0
           OR transaction_date IS NULL
    """)

    try:
        db.session.execute(sql)
        db.session.commit()
        after_count = db.session.query(Transaction).count()
        return before_count - after_count
    except Exception as e:
        db.session.rollback()
        raise e


def run_all_validations() -> Dict[str, Any]:
    """
    Run all data validation and cleaning operations.

    DEPRECATED: Use run_validation_report() for read-only checks on startup.
    This function mutates the database and should only be called from upload scripts.

    This is the main entry point for data validation during uploads.
    Runs all checks in order:
    1. Remove invalid/corrupted records
    2. Remove duplicates
    3. Filter outliers (IQR method)

    Returns:
        Dictionary with validation results:
        {
            'invalid_removed': int,
            'duplicates_removed': int,
            'outliers_removed': int,
            'total_cleaned': int,
            'final_count': int,
            'iqr_stats': dict
        }
    """
    results = {
        'invalid_removed': 0,
        'duplicates_removed': 0,
        'outliers_removed': 0,
        'total_cleaned': 0,
        'final_count': 0,
        'iqr_stats': {}
    }

    initial_count = db.session.query(Transaction).count()
    if initial_count == 0:
        return results

    print(f"\n🔍 Running data validation ({initial_count:,} records)...")

    # Step 1: Remove invalid records
    try:
        invalid_removed = remove_invalid_records()
        results['invalid_removed'] = invalid_removed
        if invalid_removed > 0:
            print(f"   ✓ Removed {invalid_removed:,} invalid records (null/zero values)")
    except Exception as e:
        print(f"   ⚠️  Invalid record removal failed: {e}")

    # Step 2: Remove duplicates
    try:
        duplicates_removed = remove_duplicates_sql()
        results['duplicates_removed'] = duplicates_removed
        if duplicates_removed > 0:
            print(f"   ✓ Removed {duplicates_removed:,} duplicate records")
    except Exception as e:
        print(f"   ⚠️  Duplicate removal failed: {e}")

    # Step 3: Mark outliers (soft-delete)
    try:
        lower_bound, upper_bound, iqr_stats = calculate_iqr_bounds()
        outlier_count = count_outliers(lower_bound, upper_bound)
        results['iqr_stats'] = iqr_stats

        if outlier_count > 0:
            print(f"   IQR bounds: ${iqr_stats['lower_bound']:,.0f} - ${iqr_stats['upper_bound']:,.0f}")
            outliers_marked, _ = filter_outliers_sql()
            results['outliers_removed'] = outliers_marked  # Keep key name for backward compat
            print(f"   ✓ Marked {outliers_marked:,} outlier records (soft-delete)")
    except Exception as e:
        print(f"   ⚠️  Outlier filtering failed: {e}")

    # Calculate totals
    results['total_cleaned'] = (
        results['invalid_removed'] +
        results['duplicates_removed'] +
        results['outliers_removed']
    )
    # Final count excludes outliers
    results['final_count'] = db.session.query(Transaction).filter(
        exclude_outliers(Transaction)
    ).count()

    if results['total_cleaned'] == 0:
        print(f"   ✓ Data is clean - no issues detected")
    else:
        print(f"   ✓ Total cleaned: {results['total_cleaned']:,} records")

    return results


def run_validation_report() -> Dict[str, Any]:
    """
    Read-only data validation report - NO DATABASE MUTATIONS.

    This function is safe to call on app startup. It only reports
    potential issues without modifying any data.

    Outlier filtering happens ONCE during the upload pipeline (staging),
    not on app startup. This ensures deterministic, reproducible datasets.

    Returns:
        Dictionary with validation report:
        {
            'total_count': int,
            'potential_issues': {
                'invalid_records': int,
                'potential_duplicates': int,
                'potential_outliers': int,
            },
            'iqr_stats': dict,
            'is_clean': bool
        }
    """
    report = {
        'total_count': 0,
        'active_count': 0,  # Non-outlier records
        'outliers_excluded': 0,  # Already marked as outliers
        'potential_issues': {
            'invalid_records': 0,
            'potential_duplicates': 0,
            'potential_outliers': 0,
        },
        'iqr_stats': {},
        'is_clean': True
    }

    total_count = db.session.query(Transaction).count()
    report['total_count'] = total_count

    # Count existing outliers (already marked)
    outlier_count = db.session.query(Transaction).filter(
        Transaction.is_outlier == True
    ).count()
    report['outliers_excluded'] = outlier_count
    report['active_count'] = total_count - outlier_count

    if total_count == 0:
        return report

    # Check for invalid records (READ-ONLY - just count)
    try:
        invalid_sql = text("""
            SELECT COUNT(*) FROM transactions
            WHERE price IS NULL OR price <= 0
               OR area_sqft IS NULL OR area_sqft <= 0
               OR psf IS NULL OR psf <= 0
               OR project_name IS NULL
        """)
        invalid_count = db.session.execute(invalid_sql).scalar()
        report['potential_issues']['invalid_records'] = invalid_count
    except Exception:
        pass

    # Check for potential duplicates (READ-ONLY - just count)
    try:
        # Count records that would be duplicates
        dup_sql = text("""
            SELECT COUNT(*) - COUNT(DISTINCT (project_name, transaction_date, price, area_sqft))
            FROM transactions
        """)
        # Simpler approach - count total minus distinct combinations
        total = db.session.execute(text("SELECT COUNT(*) FROM transactions")).scalar()
        distinct = db.session.execute(text("""
            SELECT COUNT(*) FROM (
                SELECT DISTINCT project_name, transaction_date, price, area_sqft
                FROM transactions
            ) t
        """)).scalar()
        dup_count = total - distinct
        report['potential_issues']['potential_duplicates'] = dup_count
    except Exception:
        pass

    # Check for potential outliers (READ-ONLY - just count)
    try:
        lower_bound, upper_bound, iqr_stats = calculate_iqr_bounds()
        outlier_count = count_outliers(lower_bound, upper_bound)
        report['potential_issues']['potential_outliers'] = outlier_count
        report['iqr_stats'] = iqr_stats
    except Exception:
        pass

    # Determine if data is clean
    total_issues = sum(report['potential_issues'].values())
    report['is_clean'] = total_issues == 0

    return report
