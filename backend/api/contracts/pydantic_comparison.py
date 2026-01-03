"""
Pydantic vs legacy normalization comparison logger.

Used during migration to verify Pydantic produces identical results.
Logs differences as PYDANTIC_DIFF for monitoring.
"""

import json
import logging
from datetime import date
from typing import Any, Dict, Set

logger = logging.getLogger('api.contracts.pydantic_comparison')


def compare_and_log(
    endpoint: str,
    old_result: Dict[str, Any],
    new_result: Dict[str, Any]
) -> bool:
    """
    Compare old and new normalization results, log any differences.

    Args:
        endpoint: Endpoint name for logging
        old_result: Result from old normalize_params()
        new_result: Result from Pydantic model_dump()

    Returns:
        True if results are identical, False if differences found
    """
    differences = find_differences(old_result, new_result)

    if differences:
        # Log as warning for visibility
        logger.warning(
            f"PYDANTIC_DIFF [{endpoint}]: {json.dumps(differences, default=_json_serializer)}"
        )
        return False

    return True


def find_differences(
    old: Dict[str, Any],
    new: Dict[str, Any],
    ignore_keys: Set[str] = None
) -> list:
    """
    Find differences between old and new normalized params.

    Args:
        old: Old normalization result
        new: New normalization result
        ignore_keys: Keys to ignore in comparison

    Returns:
        List of difference dicts with key, old_value, new_value
    """
    if ignore_keys is None:
        # Keys that may differ in structure but not meaning
        ignore_keys = {
            '_date_normalized',  # Metadata added by old normalize
            'date_to',  # Removed after conversion to date_to_exclusive
            'district',  # Renamed to districts
            'bedroom',  # Renamed to bedrooms
            'segment',  # Renamed to segments
            'tenure',  # Kept alongside tenures
            'region',  # Alias for segments
        }

    differences = []
    all_keys = set(old.keys()) | set(new.keys())

    for key in all_keys:
        if key in ignore_keys:
            continue

        old_val = old.get(key)
        new_val = new.get(key)

        # Normalize None vs missing
        if old_val is None and new_val is None:
            continue

        # Compare values
        if not _values_equal(old_val, new_val):
            differences.append({
                'key': key,
                'old': _serialize_value(old_val),
                'new': _serialize_value(new_val),
            })

    return differences


def _values_equal(old: Any, new: Any) -> bool:
    """
    Check if two values are equal, handling type differences.

    Handles:
    - List order doesn't matter for certain fields
    - Date string vs date object
    - None vs empty list
    """
    # Both None
    if old is None and new is None:
        return True

    # One is None, other is empty list
    if old is None and new == []:
        return True
    if new is None and old == []:
        return True

    # Date comparison
    if isinstance(old, date) and isinstance(new, str):
        return old.isoformat() == new
    if isinstance(new, date) and isinstance(old, str):
        return new.isoformat() == old

    # List comparison (order matters)
    if isinstance(old, list) and isinstance(new, list):
        if len(old) != len(new):
            return False
        return old == new

    # Direct comparison
    return old == new


def _serialize_value(val: Any) -> Any:
    """Serialize value for JSON logging."""
    if isinstance(val, date):
        return val.isoformat()
    if isinstance(val, list):
        return [_serialize_value(v) for v in val]
    return val


def _json_serializer(obj: Any) -> Any:
    """JSON serializer for objects not serializable by default."""
    if isinstance(obj, date):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
