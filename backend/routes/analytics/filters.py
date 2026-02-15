"""
Filter Options Endpoint

Returns available filter values based on current data.

Endpoints:
- /filter-options - Available filter values for all dimensions (cached 10 min)
- /districts - DEPRECATED: Use /filter-options instead (returns same data)
"""

from datetime import date
import time
from flask import jsonify
from routes.analytics import analytics_bp
from routes.analytics._route_utils import route_logger, log_error
from api.contracts import api_contract
from services.dashboard_service import _dashboard_cache

logger = route_logger("filters")

# Cache key for filter-options (no params, so static key)
FILTER_OPTIONS_CACHE_KEY = "filter-options:all"


def _get_districts_list():
    """
    Single source of truth for district list.

    Called by both /districts and /filter-options to ensure consistency.
    Returns list of district codes (D01, D02, ...) excluding outliers.
    """
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import distinct

    outlier_filter = Transaction.outlier_filter()
    return [d[0] for d in db.session.query(distinct(Transaction.district)).filter(outlier_filter).order_by(Transaction.district).all()]


@analytics_bp.route("/districts", methods=["GET"])
def get_districts():
    """
    DEPRECATED: Use /filter-options instead.

    Get list of all districts.
    Returns same data as filter-options.districts for backwards compatibility.
    """
    start = time.perf_counter()
    try:
        districts = _get_districts_list()
        return jsonify({
            "districts": districts,
            "_deprecated": True,
            "_message": "Use /filter-options instead. This endpoint will be removed in a future version."
        })
    except Exception as e:
        log_error(logger, "/api/districts", start, e)
        return jsonify({"error": str(e), "districts": []}), 500


@analytics_bp.route("/filter-options", methods=["GET"])
@api_contract("filter-options")
def filter_options():
    """
    Get available filter options based on current data.
    Returns unique values for each filterable dimension.

    Response is cached for 10 minutes (reference data doesn't change often).
    Cache status is indicated via X-Cache header (HIT/MISS).
    """
    start = time.perf_counter()

    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, distinct
    from constants import get_region_for_district
    from api.contracts.contract_schema import serialize_filter_options, PropertyAgeBucket

    # Check cache first - returns pre-wrapper data (decorator handles meta)
    cached = _dashboard_cache.get(FILTER_OPTIONS_CACHE_KEY)
    if cached is not None:
        # Return cached data - decorator will wrap with meta
        # Use header for cache status (don't mutate meta in route)
        response = jsonify(cached)
        response.headers['X-Cache'] = 'HIT'
        return response

    try:
        # Base filter to exclude outliers
        outlier_filter = Transaction.outlier_filter()

        # Get distinct values for each dimension (excluding outliers)
        # Use shared source function for districts
        districts = _get_districts_list()
        bedrooms = [b[0] for b in db.session.query(distinct(Transaction.bedroom_count)).filter(outlier_filter).order_by(Transaction.bedroom_count).all() if b[0]]
        sale_types = [s[0] for s in db.session.query(distinct(Transaction.sale_type)).filter(outlier_filter).all() if s[0]]
        projects = [p[0] for p in db.session.query(distinct(Transaction.project_name)).filter(outlier_filter).order_by(Transaction.project_name).limit(500).all() if p[0]]

        # Get date range (excluding outliers)
        min_date = db.session.query(func.min(Transaction.transaction_date)).filter(outlier_filter).scalar()
        max_date = db.session.query(func.max(Transaction.transaction_date)).filter(outlier_filter).scalar()

        # Cap max_date to today to prevent future-dated data from corrupting
        # the date range calculation (e.g., 12M filter would use wrong anchor)
        today = date.today()
        if max_date and max_date > today:
            max_date = today

        # Get PSF range (excluding outliers)
        psf_stats = db.session.query(
            func.min(Transaction.psf),
            func.max(Transaction.psf)
        ).filter(outlier_filter).first()

        # Get size range (excluding outliers)
        size_stats = db.session.query(
            func.min(Transaction.area_sqft),
            func.max(Transaction.area_sqft)
        ).filter(outlier_filter).first()

        # Get tenure options (excluding outliers)
        tenures = [t[0] for t in db.session.query(distinct(Transaction.tenure)).filter(outlier_filter).all() if t[0]]

        # Group districts by region
        regions = {"CCR": [], "RCR": [], "OCR": []}
        for d in districts:
            region = get_region_for_district(d)
            if region in regions:
                regions[region].append(d)

        # Use serializer to transform response
        date_range = {
            "min": min_date.isoformat() if min_date else None,
            "max": max_date.isoformat() if max_date else None
        }
        psf_range = {
            "min": psf_stats[0] if psf_stats else None,
            "max": psf_stats[1] if psf_stats else None
        }
        size_range = {
            "min": size_stats[0] if size_stats else None,
            "max": size_stats[1] if size_stats else None
        }

        result = serialize_filter_options(
            districts=districts,
            regions=regions,
            bedrooms=bedrooms,
            sale_types=sale_types,
            projects=projects[:100],  # Limit project list
            date_range=date_range,
            psf_range=psf_range,
            size_range=size_range,
            tenures=tenures,
            property_age_buckets=PropertyAgeBucket.ALL
        )

        # Cache the result (10 min TTL - reference data doesn't change often)
        _dashboard_cache.set(FILTER_OPTIONS_CACHE_KEY, result)

        # Return with cache miss header
        response = jsonify(result)
        response.headers['X-Cache'] = 'MISS'
        return response
    except Exception as e:
        log_error(logger, "/api/filter-options", start, e)
        return jsonify({"error": str(e)}), 500
