"""
ETL Fingerprinting Utilities

Provides hashing functions for:
- File-level fingerprinting (change detection)
- Header fingerprinting (schema drift detection)
- Row-level hashing (idempotent deduplication)

All hashes are stable and reproducible across runs.
"""
import hashlib
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import date, datetime


def canonicalize_area_sqft(area_sqft: Optional[float]) -> Optional[int]:
    """
    Canonicalize area_sqft to stable integer representation.

    Converts sqft to integer of (sqft × 100) to preserve 2 decimal places
    without rounding ambiguity. This eliminates format drift between sources.

    Args:
        area_sqft: Area in square feet (e.g., 1689.95)

    Returns:
        Integer representation (e.g., 168995), or None if input is None/NaN

    Examples:
        >>> canonicalize_area_sqft(1689.95)
        168995
        >>> canonicalize_area_sqft(1689.93)
        168993
        >>> canonicalize_area_sqft(None)
        None
    """
    if area_sqft is None:
        return None

    if isinstance(area_sqft, float):
        # Check for NaN
        if str(area_sqft) == 'nan' or area_sqft != area_sqft:
            return None

    # Convert to integer of sqft × 100 (2dp precision)
    return int(round(float(area_sqft) * 100))


def normalize_floor_range(floor_range: Optional[str]) -> Optional[str]:
    """
    Normalize floor range format for consistent hashing.

    Converts "XX to YY" → "XX-YY" format to ensure CSV and URA API
    data produce identical hashes for the same transaction.

    Args:
        floor_range: Floor range string (e.g., "11 to 15", "11-15", "B1-B2")

    Returns:
        Normalized string in "XX-YY" format, or None/original if no match

    Examples:
        >>> normalize_floor_range("11 to 15")
        '11-15'
        >>> normalize_floor_range("11-15")
        '11-15'
        >>> normalize_floor_range("B1 to B2")
        'B1-B2'
    """
    if not floor_range:
        return floor_range

    floor_range = str(floor_range).strip()
    floor_range = re.sub(r'\s+', ' ', floor_range)
    floor_range = floor_range.replace('–', '-').replace('—', '-')

    # "XX to YY" -> "XX-YY"
    match = re.match(r'^(\d+)\s+to\s+(\d+)$', floor_range, re.IGNORECASE)
    if match:
        return f"{match.group(1)}-{match.group(2)}"

    # "XX - YY" -> "XX-YY"
    match = re.match(r'^(\d+)\s*-\s*(\d+)$', floor_range)
    if match:
        return f"{match.group(1)}-{match.group(2)}"

    # Basement floors
    match = re.match(r'^(B\d+)\s+to\s+(B\d+)$', floor_range, re.IGNORECASE)
    if match:
        return f"{match.group(1).upper()}-{match.group(2).upper()}"

    match = re.match(r'^(B\d+)\s*-\s*(B\d+)$', floor_range, re.IGNORECASE)
    if match:
        return f"{match.group(1).upper()}-{match.group(2).upper()}"

    return floor_range


def compute_file_sha256(filepath: str) -> str:
    """
    Compute SHA256 hash of entire file.

    Used for change detection between batches.
    If file content hasn't changed, hash will be identical.

    Args:
        filepath: Path to file

    Returns:
        64-character hex SHA256 hash
    """
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def compute_header_fingerprint(headers: List[str]) -> str:
    """
    Compute stable hash of sorted header list.

    Detects schema drift between batches. If URA adds/removes/renames
    columns, this fingerprint will change.

    Args:
        headers: List of CSV column headers

    Returns:
        16-character hex hash
    """
    # Normalize: strip whitespace, lowercase, sort
    sorted_headers = sorted([h.strip().lower() for h in headers])
    combined = '|'.join(sorted_headers)
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


def compute_row_hash(
    row: Dict[str, Any],
    natural_key_fields: List[str],
    normalize_dates: bool = True
) -> str:
    """
    Compute stable hash from natural key fields with canonical normalization.

    This hash is used for:
    - Deduplication within a batch
    - Idempotent promotion (ON CONFLICT DO NOTHING)
    - Detecting duplicate records across batches

    Special field handling:
    - 'area_sqft_x100': Looks up 'area_sqft' in row and canonicalizes to int × 100
    - 'floor_range': Normalizes format (e.g., "11 to 15" → "11-15")
    - Other fields: Standard normalization (dates, numbers, strings)

    Args:
        row: Dict of field values (using canonical field names)
        natural_key_fields: List of field names to include in hash
        normalize_dates: If True, convert dates to YYYY-MM-DD format

    Returns:
        32-character hex hash

    Example:
        >>> natural_key = ['project_name', 'transaction_month', 'price', 'area_sqft_x100', 'floor_range']
        >>> hash = compute_row_hash(row, natural_key)
    """
    values = []
    for field in natural_key_fields:
        # Special handling for canonical fields
        if field == 'area_sqft_x100':
            # Look up 'area_sqft' and canonicalize
            area_val = row.get('area_sqft')
            canonical = canonicalize_area_sqft(area_val)
            values.append(str(canonical) if canonical is not None else '')
            continue

        if field == 'floor_range':
            # Normalize floor range format
            floor_val = row.get('floor_range')
            normalized = normalize_floor_range(floor_val)
            values.append(str(normalized).strip().lower() if normalized else '')
            continue

        # Standard field handling
        val = row.get(field)

        # Handle None/NaN consistently
        if val is None:
            values.append('')
        elif isinstance(val, float) and (str(val) == 'nan' or val != val):  # NaN check
            values.append('')
        elif normalize_dates and isinstance(val, (date, datetime)):
            # Normalize dates to YYYY-MM-DD
            values.append(val.strftime('%Y-%m-%d'))
        elif isinstance(val, (int, float)):
            # Normalize numbers - remove trailing zeros, use consistent precision
            values.append(f'{val:.6g}')
        else:
            # Normalize strings - strip whitespace, lowercase
            values.append(str(val).strip().lower())

    combined = '|'.join(values)
    return hashlib.sha256(combined.encode()).hexdigest()[:32]


def compute_row_hash_from_tuple(
    values: tuple,
    normalize_dates: bool = True
) -> str:
    """
    Compute row hash from a tuple of values (for SQL-side computation).

    Args:
        values: Tuple of values in natural key order
        normalize_dates: If True, convert dates to YYYY-MM-DD format

    Returns:
        32-character hex hash
    """
    normalized = []
    for val in values:
        if val is None:
            normalized.append('')
        elif isinstance(val, float) and (str(val) == 'nan' or val != val):
            normalized.append('')
        elif normalize_dates and isinstance(val, (date, datetime)):
            normalized.append(val.strftime('%Y-%m-%d'))
        elif isinstance(val, (int, float)):
            normalized.append(f'{val:.6g}')
        else:
            normalized.append(str(val).strip().lower())

    combined = '|'.join(normalized)
    return hashlib.sha256(combined.encode()).hexdigest()[:32]


def verify_row_hash(
    row: Dict[str, Any],
    expected_hash: str,
    natural_key_fields: List[str]
) -> bool:
    """
    Verify that a row's hash matches the expected value.

    Useful for debugging deduplication issues.

    Args:
        row: Dict of field values
        expected_hash: Expected hash value
        natural_key_fields: List of field names for natural key

    Returns:
        True if hashes match
    """
    computed = compute_row_hash(row, natural_key_fields)
    return computed == expected_hash


def compute_batch_fingerprint(file_fingerprints: Dict[str, str]) -> str:
    """
    Compute a single fingerprint for an entire batch of files.

    Args:
        file_fingerprints: Dict of {filename: sha256_hash}

    Returns:
        16-character hex hash representing the batch
    """
    # Sort by filename for consistency
    sorted_items = sorted(file_fingerprints.items())
    combined = '|'.join(f'{k}:{v}' for k, v in sorted_items)
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


# =============================================================================
# P0 GUARDRAILS - Row Hash Integrity
# =============================================================================

def assert_hash_integrity(session, source: str) -> dict:
    """
    Import-time guardrail: verify hash coverage and uniqueness.

    Checks:
    1. row_hash is NOT NULL for 100% of rows
    2. No collisions (no row_hash with count > 1)

    Call after any batch import to catch catastrophic regressions.

    Args:
        session: SQLAlchemy session
        source: 'csv' or 'ura_api'

    Returns:
        Dict with {total, with_hash, distinct, passed}

    Raises:
        AssertionError if any check fails
    """
    from sqlalchemy import text

    result = session.execute(text("""
        SELECT
            COUNT(*) as total,
            COUNT(row_hash) as with_hash,
            COUNT(DISTINCT row_hash) as distinct_hashes
        FROM transactions
        WHERE source = :source
    """), {'source': source}).fetchone()

    total = result[0]
    with_hash = result[1]
    distinct = result[2]

    stats = {
        'total': total,
        'with_hash': with_hash,
        'distinct': distinct,
        'coverage_pct': (with_hash / total * 100) if total > 0 else 0,
        'collision_count': with_hash - distinct,
        'passed': True
    }

    # Check 1: 100% coverage
    if with_hash != total:
        stats['passed'] = False
        raise AssertionError(
            f"Hash coverage violation for {source}: "
            f"{total - with_hash:,} rows missing row_hash ({with_hash:,}/{total:,})"
        )

    # Check 2: No collisions
    if with_hash != distinct:
        stats['passed'] = False
        raise AssertionError(
            f"Hash collision for {source}: "
            f"{with_hash - distinct:,} collisions ({with_hash:,} rows, {distinct:,} distinct)"
        )

    return stats


def get_overlap_window(session) -> tuple:
    """
    Get the overlapping date window between CSV and API data.

    Use this to scope validators - excludes pre-2021 CSV-only and
    Jan-2026 API-only data from match rate calculations.

    Args:
        session: SQLAlchemy session

    Returns:
        Tuple of (start_date, end_date) for the overlap window
    """
    from sqlalchemy import text

    result = session.execute(text("""
        SELECT
            GREATEST(
                (SELECT MIN(transaction_month) FROM transactions WHERE source = 'csv' AND row_hash IS NOT NULL),
                (SELECT MIN(transaction_month) FROM transactions WHERE source = 'ura_api' AND row_hash IS NOT NULL)
            ) as overlap_start,
            LEAST(
                (SELECT MAX(transaction_month) FROM transactions WHERE source = 'csv' AND row_hash IS NOT NULL),
                (SELECT MAX(transaction_month) FROM transactions WHERE source = 'ura_api' AND row_hash IS NOT NULL)
            ) as overlap_end
    """)).fetchone()

    return (result[0], result[1])
