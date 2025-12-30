"""
Cache key helpers.

Provides stable, normalized cache key construction to avoid drift between callers.
"""

from datetime import date, datetime
import json
from typing import Any, Dict, Iterable, Optional


def _normalize_cache_value(value: Any, *, list_strategy: str = "list") -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, list):
        normalized = [_normalize_cache_value(v, list_strategy=list_strategy) for v in value]
        if list_strategy == "csv":
            return ",".join(str(v) for v in normalized)
        return normalized
    if isinstance(value, dict):
        return {k: _normalize_cache_value(v, list_strategy=list_strategy) for k, v in sorted(value.items())}
    return value


def normalize_cache_params(
    params: Dict[str, Any],
    *,
    include_keys: Optional[Iterable[str]] = None,
    list_strategy: str = "list"
) -> Dict[str, Any]:
    """
    Normalize params for cache keys.

    - Skips empty values
    - Sorts keys for stability
    - Normalizes dates and nested structures
    """
    allowed = set(include_keys) if include_keys is not None else None
    filtered: Dict[str, Any] = {}
    for key, value in params.items():
        if allowed is not None and key not in allowed:
            continue
        if value in (None, "", [], {}):
            continue
        filtered[key] = _normalize_cache_value(value, list_strategy=list_strategy)
    return {k: filtered[k] for k in sorted(filtered.keys())}


def build_json_cache_key(
    prefix: str,
    params: Dict[str, Any],
    *,
    include_keys: Optional[Iterable[str]] = None
) -> str:
    normalized = normalize_cache_params(params, include_keys=include_keys, list_strategy="list")
    return f"{prefix}:{json.dumps(normalized, sort_keys=True)}"


def build_query_cache_key(
    prefix: str,
    params: Dict[str, Any],
    *,
    include_keys: Optional[Iterable[str]] = None
) -> str:
    normalized = normalize_cache_params(params, include_keys=include_keys, list_strategy="csv")
    param_str = "&".join(f"{k}={v}" for k, v in normalized.items())
    return f"{prefix}:{param_str}"
