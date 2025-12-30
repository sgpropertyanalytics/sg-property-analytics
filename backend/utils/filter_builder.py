"""
Filter builder utilities.

Provides a single source of truth for standard filter handling across services.
"""

from datetime import timedelta
from typing import Any, Dict, Iterable, List, Tuple

from sqlalchemy import func

from constants import get_districts_for_region
from db.sql import OUTLIER_FILTER, exclude_outliers
from utils.normalize import coerce_to_date


def normalize_district(district: Any) -> str:
    """Normalize district format to DXX."""
    d = str(district).strip().upper()
    if not d:
        return d
    suffix = d[1:] if d.startswith('D') else d
    if suffix.isdigit():
        return f"D{suffix.zfill(2)}"
    return d


def _expand_list(value: Any) -> List[Any]:
    if value is None:
        return []
    items = value if isinstance(value, list) else [value]
    expanded: List[Any] = []
    for item in items:
        if isinstance(item, str) and "," in item:
            expanded.extend([p.strip() for p in item.split(",") if p.strip()])
        else:
            expanded.append(item)
    return expanded


def _extract_districts(filters: Dict[str, Any]) -> List[str]:
    raw = filters.get('districts') or filters.get('district')
    if not raw:
        return []
    return [normalize_district(d) for d in _expand_list(raw)]


def _extract_segments(filters: Dict[str, Any]) -> List[str]:
    segments = _expand_list(filters.get('segments') or [])
    if not segments:
        single_segment = filters.get('segment')
        if single_segment:
            segments = _expand_list(single_segment)
    return [str(s).strip().upper() for s in segments if str(s).strip()]


def _extract_bedrooms(filters: Dict[str, Any]) -> List[int]:
    raw = filters.get('bedrooms') or filters.get('bedroom')
    if not raw:
        return []
    bedrooms: List[int] = []
    for item in _expand_list(raw):
        if isinstance(item, str):
            item = item.strip()
        if item in ("", None):
            continue
        bedrooms.append(int(item))
    return bedrooms


def _segment_districts(segments: Iterable[str]) -> List[str]:
    districts: List[str] = []
    for seg in segments:
        seg_districts = get_districts_for_region(seg)
        if seg_districts:
            districts.extend(seg_districts)
    return districts


def build_sqlalchemy_filters(
    filters: Dict[str, Any],
    *,
    include_outliers: bool = False,
    include_project: bool = True,
    include_tenure: bool = True
) -> List[Any]:
    """
    Build SQLAlchemy filter conditions from standard filters.

    Returns:
        List of SQLAlchemy conditions to be combined with and_().
    """
    from models.transaction import Transaction

    conditions: List[Any] = []

    if not include_outliers:
        conditions.append(exclude_outliers(Transaction))

    # Date range
    if filters.get('date_from'):
        try:
            from_dt = coerce_to_date(filters['date_from'])
            conditions.append(Transaction.transaction_date >= from_dt)
        except ValueError:
            pass

    if filters.get('date_to'):
        try:
            to_dt = coerce_to_date(filters['date_to'])
            conditions.append(Transaction.transaction_date < to_dt + timedelta(days=1))
        except ValueError:
            pass

    # Districts or segments
    districts = _extract_districts(filters)
    if districts:
        conditions.append(Transaction.district.in_(districts))
    else:
        segments = _extract_segments(filters)
        if segments:
            seg_districts = _segment_districts(segments)
            if seg_districts:
                conditions.append(Transaction.district.in_(seg_districts))

    # Bedrooms
    bedrooms = _extract_bedrooms(filters)
    if bedrooms:
        conditions.append(Transaction.bedroom_count.in_(bedrooms))

    # Sale type (case-insensitive)
    sale_type = filters.get('sale_type')
    if sale_type:
        conditions.append(func.lower(Transaction.sale_type) == sale_type.lower())

    # PSF range
    if filters.get('psf_min') is not None:
        conditions.append(Transaction.psf >= float(filters['psf_min']))
    if filters.get('psf_max') is not None:
        conditions.append(Transaction.psf <= float(filters['psf_max']))

    # Price range
    if filters.get('price_min') is not None:
        conditions.append(Transaction.price >= float(filters['price_min']))
    if filters.get('price_max') is not None:
        conditions.append(Transaction.price <= float(filters['price_max']))

    # Size range
    if filters.get('size_min') is not None:
        conditions.append(Transaction.area_sqft >= float(filters['size_min']))
    if filters.get('size_max') is not None:
        conditions.append(Transaction.area_sqft <= float(filters['size_max']))

    # Tenure
    if include_tenure and filters.get('tenure'):
        conditions.append(func.lower(Transaction.tenure) == filters['tenure'].lower())

    # Project
    if include_project:
        if filters.get('project_exact'):
            conditions.append(Transaction.project_name == filters['project_exact'])
        elif filters.get('project'):
            conditions.append(Transaction.project_name.ilike(f"%{filters['project']}%"))

    return conditions


def build_sql_where(
    filters: Dict[str, Any],
    *,
    include_outliers: bool = False,
    include_project: bool = True,
    include_tenure: bool = True
) -> Tuple[List[str], Dict[str, Any]]:
    """
    Build raw SQL WHERE clause parts and params from standard filters.

    Returns:
        (where_parts, params)
    """
    where_parts: List[str] = []
    params: Dict[str, Any] = {}

    if not include_outliers:
        where_parts.append(OUTLIER_FILTER)

    # Date range
    if filters.get('date_from'):
        try:
            params['date_from'] = coerce_to_date(filters['date_from'])
            where_parts.append("transaction_date >= :date_from")
        except ValueError:
            pass
    if filters.get('date_to'):
        try:
            to_dt = coerce_to_date(filters['date_to'])
            params['date_to_exclusive'] = to_dt + timedelta(days=1)
            where_parts.append("transaction_date < :date_to_exclusive")
        except ValueError:
            pass

    # Districts or segments
    districts = _extract_districts(filters)
    if districts:
        placeholders = ','.join([f":district_{i}" for i in range(len(districts))])
        where_parts.append(f"district IN ({placeholders})")
        for i, d in enumerate(districts):
            params[f'district_{i}'] = d
    else:
        segments = _extract_segments(filters)
        if segments:
            seg_districts = _segment_districts(segments)
            if seg_districts:
                placeholders = ','.join([f":seg_district_{i}" for i in range(len(seg_districts))])
                where_parts.append(f"district IN ({placeholders})")
                for i, d in enumerate(seg_districts):
                    params[f'seg_district_{i}'] = d

    # Bedrooms
    bedrooms = _extract_bedrooms(filters)
    if bedrooms:
        placeholders = ','.join([f":bedroom_{i}" for i in range(len(bedrooms))])
        where_parts.append(f"bedroom_count IN ({placeholders})")
        for i, b in enumerate(bedrooms):
            params[f'bedroom_{i}'] = b

    # Sale type
    if filters.get('sale_type'):
        where_parts.append("LOWER(sale_type) = LOWER(:sale_type)")
        params['sale_type'] = filters['sale_type']

    # PSF range
    if filters.get('psf_min') is not None:
        where_parts.append("psf >= :psf_min")
        params['psf_min'] = float(filters['psf_min'])
    if filters.get('psf_max') is not None:
        where_parts.append("psf <= :psf_max")
        params['psf_max'] = float(filters['psf_max'])

    # Price range
    if filters.get('price_min') is not None:
        where_parts.append("price >= :price_min")
        params['price_min'] = float(filters['price_min'])
    if filters.get('price_max') is not None:
        where_parts.append("price <= :price_max")
        params['price_max'] = float(filters['price_max'])

    # Size range
    if filters.get('size_min') is not None:
        where_parts.append("area_sqft >= :size_min")
        params['size_min'] = float(filters['size_min'])
    if filters.get('size_max') is not None:
        where_parts.append("area_sqft <= :size_max")
        params['size_max'] = float(filters['size_max'])

    # Tenure
    if include_tenure and filters.get('tenure'):
        where_parts.append("LOWER(tenure) = LOWER(:tenure)")
        params['tenure'] = filters['tenure']

    # Project
    if include_project:
        if filters.get('project_exact'):
            where_parts.append("project_name = :project_exact")
            params['project_exact'] = filters['project_exact']
        elif filters.get('project'):
            where_parts.append("project_name ILIKE :project")
            params['project'] = f"%{filters['project']}%"

    return where_parts, params
