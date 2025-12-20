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


def calculate_iqr_bounds(column: str = 'price') -> Tuple[float, float, Dict[str, float]]:
    """
    Calculate IQR bounds for outlier detection using SQL.

    Args:
        column: Column name to calculate IQR for (default: 'price')

    Returns:
        Tuple of (lower_bound, upper_bound, statistics_dict)
        statistics_dict contains: q1, q3, iqr, lower_bound, upper_bound
    """
    # PostgreSQL percentile function (SQLite not supported)
    quartile_sql = text(f"""
        SELECT
            percentile_cont(0.25) WITHIN GROUP (ORDER BY {column}) as q1,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY {column}) as q3
        FROM transactions
        WHERE {column} > 0
    """)
    result = db.session.execute(quartile_sql).fetchone()
    q1, q3 = float(result[0]), float(result[1])

    iqr = q3 - q1
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr

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
    Count records that fall outside the IQR bounds.

    Args:
        lower_bound: Lower bound for valid data
        upper_bound: Upper bound for valid data
        column: Column to check (default: 'price')

    Returns:
        Count of outlier records
    """
    count_sql = text(f"""
        SELECT COUNT(*) FROM transactions
        WHERE {column} < :lower_bound OR {column} > :upper_bound
    """)
    return db.session.execute(
        count_sql,
        {'lower_bound': lower_bound, 'upper_bound': upper_bound}
    ).scalar()


def get_sample_outliers(lower_bound: float, upper_bound: float,
                        column: str = 'price', limit: int = 10) -> List[Dict[str, Any]]:
    """
    Get sample outlier records for preview.

    Args:
        lower_bound: Lower bound for valid data
        upper_bound: Upper bound for valid data
        column: Column to check (default: 'price')
        limit: Max samples to return

    Returns:
        List of outlier records with project_name, price, district
    """
    sample_sql = text(f"""
        SELECT project_name, {column}, district
        FROM transactions
        WHERE {column} < :lower_bound OR {column} > :upper_bound
        ORDER BY {column} DESC
        LIMIT :limit
    """)
    samples = db.session.execute(
        sample_sql,
        {'lower_bound': lower_bound, 'upper_bound': upper_bound, 'limit': limit}
    ).fetchall()

    return [
        {"project": s[0], "price": float(s[1]), "district": s[2]}
        for s in samples
    ]


def filter_outliers_sql(column: str = 'price', dry_run: bool = False) -> Tuple[int, Dict[str, Any]]:
    """
    Filter outliers from database using SQL-based IQR calculation.

    This is the main outlier filtering function. It:
    1. Calculates IQR bounds
    2. Identifies outliers
    3. Deletes them from the database (unless dry_run=True)

    Args:
        column: Column to filter outliers on (default: 'price')
        dry_run: If True, only preview without deleting

    Returns:
        Tuple of (outliers_removed_count, statistics_dict)
    """
    before_count = db.session.query(Transaction).count()

    # Calculate bounds
    lower_bound, upper_bound, stats = calculate_iqr_bounds(column)

    # Count outliers
    outlier_count = count_outliers(lower_bound, upper_bound, column)

    stats['before_count'] = before_count
    stats['outlier_count'] = outlier_count

    if dry_run or outlier_count == 0:
        stats['action'] = 'preview' if dry_run else 'none'
        stats['outliers_removed'] = 0
        return 0, stats

    # Delete outliers
    delete_sql = text(f"""
        DELETE FROM transactions
        WHERE {column} < :lower_bound OR {column} > :upper_bound
    """)
    db.session.execute(delete_sql, {'lower_bound': lower_bound, 'upper_bound': upper_bound})
    db.session.commit()

    after_count = db.session.query(Transaction).count()
    outliers_removed = before_count - after_count

    stats['action'] = 'deleted'
    stats['outliers_removed'] = outliers_removed
    stats['after_count'] = after_count

    return outliers_removed, stats


def remove_duplicates_sql() -> int:
    """
    Remove duplicate transactions using SQL.

    Duplicates are identified by matching:
    - project_name
    - transaction_date
    - price
    - area_sqft
    - floor_range (if column exists - added for more accurate deduplication)

    Keeps the first occurrence (lowest ID) of each duplicate set.

    Returns:
        Count of duplicates removed
    """
    before_count = db.session.query(Transaction).count()

    # Check if floor_range column exists (for backward compatibility)
    try:
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        columns = [col['name'] for col in inspector.get_columns('transactions')]
        has_floor_range = 'floor_range' in columns
    except:
        has_floor_range = False

    # Use floor_range in deduplication if available for more accurate matching
    if has_floor_range:
        sql = text("""
            DELETE FROM transactions
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM transactions
                GROUP BY project_name, transaction_date, price, area_sqft,
                         COALESCE(floor_range, '')
            )
        """)
    else:
        sql = text("""
            DELETE FROM transactions
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM transactions
                GROUP BY project_name, transaction_date, price, area_sqft
            )
        """)

    try:
        db.session.execute(sql)
        db.session.commit()
        after_count = db.session.query(Transaction).count()
        return before_count - after_count
    except Exception as e:
        db.session.rollback()
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


def get_data_quality_report() -> Dict[str, Any]:
    """
    Generate a data quality report for the current database.

    Returns:
        Dictionary with quality metrics
    """
    total_count = db.session.query(Transaction).count()

    if total_count == 0:
        return {"error": "No data in database"}

    # Count records with missing values
    null_counts = {}
    for column in ['price', 'area_sqft', 'psf', 'district', 'bedroom_count', 'transaction_date']:
        sql = text(f"SELECT COUNT(*) FROM transactions WHERE {column} IS NULL")
        null_counts[column] = db.session.execute(sql).scalar()

    # Get IQR stats
    _, _, price_stats = calculate_iqr_bounds('price')

    # Count potential outliers (without removing)
    outlier_count = count_outliers(price_stats['lower_bound'], price_stats['upper_bound'])

    return {
        'total_records': total_count,
        'null_counts': null_counts,
        'price_statistics': price_stats,
        'potential_outliers': outlier_count,
        'outlier_percentage': round(outlier_count / total_count * 100, 2) if total_count > 0 else 0
    }


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

    # Step 3: Filter outliers
    try:
        lower_bound, upper_bound, iqr_stats = calculate_iqr_bounds()
        outlier_count = count_outliers(lower_bound, upper_bound)
        results['iqr_stats'] = iqr_stats

        if outlier_count > 0:
            print(f"   IQR bounds: ${iqr_stats['lower_bound']:,.0f} - ${iqr_stats['upper_bound']:,.0f}")
            outliers_removed, _ = filter_outliers_sql()
            results['outliers_removed'] = outliers_removed
            print(f"   ✓ Removed {outliers_removed:,} outlier records")
    except Exception as e:
        print(f"   ⚠️  Outlier filtering failed: {e}")

    # Calculate totals
    results['total_cleaned'] = (
        results['invalid_removed'] +
        results['duplicates_removed'] +
        results['outliers_removed']
    )
    results['final_count'] = db.session.query(Transaction).count()

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
