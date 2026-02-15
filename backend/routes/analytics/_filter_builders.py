"""
Shared filter/option builders for analytics routes.
"""

from datetime import timedelta
from typing import Any, Dict, Optional

from utils.normalize import to_list, clamp_date_to_today
from routes.analytics._param_utils import first_or_none, first_int_or_none


def extract_scope_filters(
    params: Dict[str, Any],
    clamp_end_to_today: bool = False,
) -> Dict[str, Any]:
    """
    Extract common global scope filters used by multiple analytics routes.

    Returns keys:
    - districts: list[str] | None
    - bedrooms: list[int] | None
    - segment: str | None
    - date_from: date | None
    - date_to: date | None (inclusive if derived from date_to_exclusive)
    """
    districts = params.get("districts") or []
    bedrooms = to_list(params.get("bedrooms"), item_type=int)
    segments = to_list(params.get("segments"))
    segment = first_or_none(segments)

    date_from = params.get("date_from")
    date_to = params.get("date_to_exclusive") or params.get("date_to")
    if date_to and params.get("date_to_exclusive"):
        date_to = date_to - timedelta(days=1)
    if clamp_end_to_today and date_to:
        date_to = clamp_date_to_today(date_to)

    return {
        "districts": districts if districts else None,
        "bedrooms": bedrooms if bedrooms else None,
        "segment": segment,
        "date_from": date_from,
        "date_to": date_to,
    }


def build_dashboard_filters(params: Dict[str, Any]) -> Dict[str, Any]:
    """Build filters payload for dashboard service from normalized params."""
    filters: Dict[str, Any] = {}
    scope = extract_scope_filters(params, clamp_end_to_today=False)

    if scope["date_from"]:
        filters["date_from"] = scope["date_from"]
    if scope["date_to"]:
        filters["date_to"] = scope["date_to"]
    if scope["districts"]:
        filters["districts"] = scope["districts"]
    if scope["bedrooms"]:
        filters["bedrooms"] = scope["bedrooms"]

    segments = to_list(params.get("segments"))
    if segments:
        filters["segments"] = [s.upper() for s in segments]

    for field in (
        "sale_type", "psf_min", "psf_max", "size_min", "size_max",
        "tenure", "property_age_min", "property_age_max", "property_age_bucket",
    ):
        value = params.get(field)
        if value is not None and value != "":
            filters[field] = value

    project_exact = params.get("project_exact")
    project = params.get("project")
    if project_exact:
        filters["project_exact"] = project_exact
    elif project:
        filters["project"] = project

    return filters


def build_dashboard_options(params: Dict[str, Any]) -> Dict[str, Any]:
    """Build options payload for dashboard service from normalized params."""
    options: Dict[str, Any] = {}
    for field in ("time_grain", "location_grain", "histogram_bins"):
        value = params.get(field)
        if value is not None and value != "":
            options[field] = value
    options["show_full_range"] = params.get("show_full_range", False)
    return options


def build_panels_param(params: Dict[str, Any]) -> Optional[list]:
    """Normalize panels param to list or None."""
    panels = to_list(params.get("panels"))
    return panels if panels else None


def extract_price_growth_params(params: Dict[str, Any]) -> Dict[str, Any]:
    """Extract shared params for transactions/price-growth endpoints."""
    date_to = None
    date_to_exclusive = params.get("date_to_exclusive")
    if date_to_exclusive:
        date_to = clamp_date_to_today(date_to_exclusive - timedelta(days=1))

    return {
        "project_name": params.get("project"),
        "bedroom_count": first_int_or_none(params.get("bedrooms")),
        "floor_level": params.get("floor_level"),
        "sale_type": params.get("sale_type"),
        "district": first_or_none(params.get("districts")),
        "date_from": params.get("date_from"),
        "date_to": date_to,
        "page": params.get("page", 1),
        "per_page": params.get("per_page", 50),
    }


def build_aggregate_sqlalchemy_filters(
    params: Dict[str, Any],
    Transaction: Any,
    func: Any,
    and_: Any,
    or_: Any,
) -> Dict[str, Any]:
    """
    Build SQLAlchemy filter conditions for /api/aggregate.

    Returns:
    - filter_conditions: list of SQLAlchemy expressions
    - filters_applied: dict for response/meta diagnostics
    - from_dt: inclusive date_from
    - to_dt: inclusive date_to (derived from exclusive bound)
    """
    from constants import (
        TENURE_FREEHOLD,
        TENURE_99_YEAR,
        TENURE_999_YEAR,
        get_districts_for_region,
    )

    filter_conditions = [Transaction.outlier_filter()]
    filters_applied: Dict[str, Any] = {}

    districts = params.get("districts") or []
    if districts:
        filter_conditions.append(Transaction.district.in_(districts))
        filters_applied["district"] = districts

    bedrooms = to_list(params.get("bedrooms"), item_type=int)
    if bedrooms:
        filter_conditions.append(Transaction.bedroom_count.in_(bedrooms))
        filters_applied["bedroom"] = bedrooms

    segments = to_list(params.get("segments"))
    if segments:
        segments = [s.strip().upper() for s in segments]
        segment_districts = []
        for seg in segments:
            segment_districts.extend(get_districts_for_region(seg))
        if segment_districts:
            filter_conditions.append(Transaction.district.in_(segment_districts))
        filters_applied["segment"] = segments

    sale_type = params.get("sale_type")
    if sale_type:
        filter_conditions.append(func.lower(Transaction.sale_type) == sale_type.lower())
        filters_applied["sale_type"] = sale_type

    from_dt = params.get("date_from")
    if from_dt:
        filter_conditions.append(Transaction.transaction_date >= from_dt)
        filters_applied["date_from"] = from_dt.isoformat()

    to_dt_exclusive = params.get("date_to_exclusive")
    to_dt = None
    if to_dt_exclusive:
        filter_conditions.append(Transaction.transaction_date < to_dt_exclusive)
        to_dt = to_dt_exclusive - timedelta(days=1)
        filters_applied["date_to"] = to_dt.isoformat()

    if params.get("psf_min") is not None:
        psf_min = params.get("psf_min")
        filter_conditions.append(Transaction.psf >= psf_min)
        filters_applied["psf_min"] = psf_min
    if params.get("psf_max") is not None:
        psf_max = params.get("psf_max")
        filter_conditions.append(Transaction.psf <= psf_max)
        filters_applied["psf_max"] = psf_max

    if params.get("size_min") is not None:
        size_min = params.get("size_min")
        filter_conditions.append(Transaction.area_sqft >= size_min)
        filters_applied["size_min"] = size_min
    if params.get("size_max") is not None:
        size_max = params.get("size_max")
        filter_conditions.append(Transaction.area_sqft <= size_max)
        filters_applied["size_max"] = size_max

    tenure = params.get("tenure")
    if tenure:
        tenure_lower = tenure.lower()
        if tenure_lower == TENURE_FREEHOLD.lower():
            filter_conditions.append(or_(
                Transaction.tenure.ilike("%freehold%"),
                Transaction.remaining_lease == 999
            ))
        elif tenure_lower in [TENURE_99_YEAR.lower(), "99"]:
            filter_conditions.append(and_(
                Transaction.remaining_lease < 999,
                Transaction.remaining_lease > 0
            ))
        elif tenure_lower in [TENURE_999_YEAR.lower(), "999"]:
            filter_conditions.append(Transaction.remaining_lease == 999)
        filters_applied["tenure"] = tenure

    project_exact = params.get("project_exact")
    project = params.get("project")
    if project_exact:
        filter_conditions.append(Transaction.project_name == project_exact)
        filters_applied["project_exact"] = project_exact
    elif project:
        filter_conditions.append(Transaction.project_name.ilike(f"%{project}%"))
        filters_applied["project"] = project

    return {
        "filter_conditions": filter_conditions,
        "filters_applied": filters_applied,
        "from_dt": from_dt,
        "to_dt": to_dt,
    }
