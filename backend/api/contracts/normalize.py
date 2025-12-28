"""
Param normalization - adapts public params to service-ready shapes.

Handles:
- Singular -> plural (district -> districts[])
- Type coercion (string "2,3" -> [2, 3])
- Date bounds (date_to -> date_to_exclusive)
- Month-boundary alignment for month-granularity data
- District normalization (9 -> D09, d09 -> D09)
- Alias resolution (saleType -> sale_type)
"""

import logging
from datetime import date, timedelta
from typing import Dict, Any, List, Optional

from .registry import ParamSchema, FieldSpec

# Import existing normalize helpers
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

try:
    from utils.normalize import to_int, to_date, to_list, to_bool, to_float
except ImportError:
    # Fallback implementations if utils.normalize not available
    def to_int(value, *, default=None, field=None):
        if value is None or value == '':
            return default
        return int(value)

    def to_float(value, *, default=None, field=None):
        if value is None or value == '':
            return default
        return float(value)

    def to_bool(value, *, default=False, field=None):
        if value is None or value == '':
            return default
        if isinstance(value, bool):
            return value
        return str(value).lower() in ('true', '1', 'yes', 'on')

    def to_date(value, *, default=None, field=None):
        if value is None or value == '':
            return default
        if isinstance(value, date):
            return value
        from datetime import datetime
        return datetime.strptime(value, '%Y-%m-%d').date()

    def to_list(value, *, default=None, separator=',', item_type=str, field=None):
        if value is None or value == '':
            return default or []
        if isinstance(value, list):
            return value
        items = [item.strip() for item in str(value).split(separator)]
        if item_type == int:
            return [int(item) for item in items if item]
        return [item for item in items if item]


logger = logging.getLogger('api.contracts.normalize')


def normalize_params(raw: Dict[str, Any], schema: ParamSchema) -> Dict[str, Any]:
    """
    Normalize raw params to service-ready shape.

    Steps:
    1. Apply aliases (saleType -> sale_type)
    2. Coerce types based on schema
    3. Apply domain-specific normalizations (districts, dates, etc.)
    4. Convert singulars to plurals

    Args:
        raw: Raw params from request
        schema: ParamSchema defining expected fields

    Returns:
        Normalized params dict ready for service layer
    """
    # Make a copy to avoid mutating input
    params = dict(raw)
    normalized = {}

    # 1. Apply aliases first
    for old_key, new_key in schema.aliases.items():
        if old_key in params and new_key not in params:
            params[new_key] = params.pop(old_key)
            _log_normalization(old_key, new_key, params[new_key], "alias")

    # 2. Process each field defined in schema
    for field_name, spec in schema.fields.items():
        value = params.get(field_name)

        # Apply default if value is None/empty
        if value is None or value == '':
            if spec.default is not None:
                value = spec.default

        # Coerce type if value is present
        if value is not None:
            try:
                normalized[field_name] = _coerce_field(value, spec)
            except (ValueError, TypeError) as e:
                # Let validation layer handle the error
                normalized[field_name] = value

    # 3. Apply domain-specific normalizations
    normalized = _normalize_districts(normalized)
    normalized = _normalize_date_bounds(normalized)
    normalized = _normalize_month_windows(normalized)
    normalized = _singulars_to_plurals(normalized)
    normalized = _normalize_comma_lists(normalized)

    return normalized


def _coerce_field(value: Any, spec: FieldSpec) -> Any:
    """Coerce value to expected type based on FieldSpec."""
    # Already correct type
    if isinstance(value, spec.type):
        return value

    # Coerce based on target type
    if spec.type == int:
        return to_int(value, field=spec.name)
    elif spec.type == float:
        return to_float(value, field=spec.name)
    elif spec.type == bool:
        return to_bool(value, field=spec.name)
    elif spec.type == date:
        return to_date(value, field=spec.name)
    elif spec.type == list:
        return to_list(value, field=spec.name)

    # Default: return as-is
    return value


def _normalize_districts(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize district codes: 9 -> D09, d01 -> D01.

    Handles:
    - Numeric input: 9 -> D09
    - Lowercase: d09 -> D09
    - Missing D prefix: 09 -> D09
    """
    if 'district' in params and params['district']:
        raw_districts = params['district']

        # Handle string input
        if isinstance(raw_districts, str):
            raw_districts = [d.strip() for d in raw_districts.split(',')]
        elif not isinstance(raw_districts, list):
            raw_districts = [raw_districts]

        normalized = []
        for d in raw_districts:
            d = str(d).strip().upper()
            if not d:
                continue
            # Numeric only
            if d.isdigit():
                d = f"D{int(d):02d}"
            # Has D prefix but wrong format
            elif d.startswith('D') and d[1:].isdigit():
                d = f"D{int(d[1:]):02d}"
            # No D prefix
            elif not d.startswith('D'):
                try:
                    d = f"D{int(d):02d}"
                except ValueError:
                    pass  # Keep as-is if not convertible
            normalized.append(d)

        if normalized:
            _log_normalization('district', 'districts', normalized, "plural")
            params['districts'] = normalized
        del params['district']

    return params


def _normalize_date_bounds(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert date_to to date_to_exclusive.

    Ensures half-open interval: [date_from, date_to_exclusive)

    This is the API contract: date_to is exclusive.
    """
    if 'date_to' in params and params['date_to']:
        dt = params['date_to']
        if isinstance(dt, date):
            # Add one day for exclusive upper bound
            params['date_to_exclusive'] = dt + timedelta(days=1)
            _log_normalization('date_to', 'date_to_exclusive', params['date_to_exclusive'], "exclusive")
        del params['date_to']

    return params


def _normalize_month_windows(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    URA data is month-granularity (all txns dated 1st of month).
    Align date bounds to month boundaries.

    This prevents edge cases where:
    - "Last 90 days" from Dec 27 creates Oct 2 boundary
    - Which excludes ALL October data (dated Oct 1)
    """
    if 'date_from' in params and params['date_from']:
        dt = params['date_from']
        if isinstance(dt, date):
            # Align to 1st of month
            aligned = date(dt.year, dt.month, 1)
            if aligned != dt:
                _log_normalization('date_from', 'date_from', aligned, "month_align")
            params['date_from'] = aligned

    if 'date_to_exclusive' in params and params['date_to_exclusive']:
        dt = params['date_to_exclusive']
        if isinstance(dt, date):
            # Align to 1st of next month if not already aligned
            if dt.day != 1:
                if dt.month == 12:
                    aligned = date(dt.year + 1, 1, 1)
                else:
                    aligned = date(dt.year, dt.month + 1, 1)
                _log_normalization('date_to_exclusive', 'date_to_exclusive', aligned, "month_align")
                params['date_to_exclusive'] = aligned

    return params


def _singulars_to_plurals(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert singular params to plural lists.

    Mappings:
    - bedroom -> bedrooms
    - segment -> segments
    - tenure -> tenures
    - sale_type stays as sale_type (not pluralized, filter by single type)
    """
    mappings = {
        'bedroom': 'bedrooms',
        'segment': 'segments',
        'tenure': 'tenures',
    }

    for singular, plural in mappings.items():
        if singular in params:
            value = params[singular]
            if value is not None:
                if not isinstance(value, list):
                    value = [value] if value else []
                if value:
                    _log_normalization(singular, plural, value, "plural")
                    params[plural] = value
            del params[singular]

    return params


def _normalize_comma_lists(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure comma-separated string fields become lists.

    Handles:
    - group_by="month,district" -> ["month", "district"]
    - metrics="count,median_psf" -> ["count", "median_psf"]
    """
    list_fields = ['group_by', 'metrics']

    for field in list_fields:
        if field in params and isinstance(params[field], str):
            params[field] = [v.strip() for v in params[field].split(',') if v.strip()]

    return params


def _log_normalization(from_key: str, to_key: str, value: Any, reason: str) -> None:
    """Log param normalization for observability."""
    logger.debug(
        f"param_normalization: {from_key} -> {to_key} = {value} ({reason})"
    )
