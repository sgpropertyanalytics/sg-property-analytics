"""
ETL Fingerprinting Utilities

Provides hashing functions for:
- File-level fingerprinting (change detection)
- Header fingerprinting (schema drift detection)
- Row-level hashing (idempotent deduplication)

All hashes are stable and reproducible across runs.
"""
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import date, datetime


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
    Compute stable hash from natural key fields.

    This hash is used for:
    - Deduplication within a batch
    - Idempotent promotion (ON CONFLICT DO NOTHING)
    - Detecting duplicate records across batches

    Args:
        row: Dict of field values (using canonical field names)
        natural_key_fields: List of field names to include in hash
        normalize_dates: If True, convert dates to YYYY-MM-DD format

    Returns:
        32-character hex hash

    Example:
        >>> natural_key = ['project_name', 'transaction_month', 'price', 'area_sqft', 'floor_range']
        >>> hash = compute_row_hash(row, natural_key)
    """
    values = []
    for field in natural_key_fields:
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
