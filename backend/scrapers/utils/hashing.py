"""
Consistent JSON Hashing for Change Detection

Provides deterministic hashing of JSON data for:
- Schema change detection
- Deduplication
- Content versioning
"""
import hashlib
import json
from typing import Any, Dict, List, Union
from decimal import Decimal
from datetime import date, datetime


def normalize_json_for_hash(data: Any) -> Any:
    """
    Normalize JSON data for consistent hashing.

    - Sorts dictionary keys
    - Converts special types to strings
    - Removes None values
    - Normalizes whitespace

    Args:
        data: JSON-serializable data

    Returns:
        Normalized data structure
    """
    if data is None:
        return None

    if isinstance(data, dict):
        # Sort keys and recursively normalize values
        return {
            k: normalize_json_for_hash(v)
            for k, v in sorted(data.items())
            if v is not None  # Remove None values
        }

    if isinstance(data, (list, tuple)):
        # Normalize each item (preserve order)
        return [normalize_json_for_hash(item) for item in data]

    if isinstance(data, datetime):
        return data.isoformat()

    if isinstance(data, date):
        return data.isoformat()

    if isinstance(data, Decimal):
        # Normalize decimal to string with consistent precision
        return str(data.normalize())

    if isinstance(data, float):
        # Round floats to avoid precision issues
        return round(data, 10)

    if isinstance(data, str):
        # Normalize whitespace
        return " ".join(data.split())

    return data


def compute_json_hash(data: Any) -> str:
    """
    Compute SHA256 hash of JSON data.

    Uses normalized JSON for consistent hashing regardless of:
    - Key order
    - Whitespace
    - Type variations (e.g., date formats)

    Args:
        data: JSON-serializable data

    Returns:
        64-character hex SHA256 hash
    """
    normalized = normalize_json_for_hash(data)
    json_str = json.dumps(normalized, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


def compute_field_hashes(data: Dict[str, Any]) -> Dict[str, str]:
    """
    Compute individual hashes for each top-level field.

    Useful for detecting which specific fields changed.

    Args:
        data: Dictionary of fields

    Returns:
        Dictionary mapping field names to their hashes
    """
    return {
        key: compute_json_hash(value)
        for key, value in data.items()
        if value is not None
    }


def compute_raw_html_hash(html: str) -> str:
    """
    Compute hash of raw HTML content.

    Normalizes whitespace for consistent hashing.

    Args:
        html: Raw HTML string

    Returns:
        64-character hex SHA256 hash
    """
    # Normalize whitespace
    normalized = " ".join(html.split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
