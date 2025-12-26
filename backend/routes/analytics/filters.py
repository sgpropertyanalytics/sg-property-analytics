"""
Filter Options Endpoint

Returns available filter values based on current data.

Endpoints:
- /filter-options - Available filter values for all dimensions
"""

from flask import request, jsonify
from routes.analytics import analytics_bp


@analytics_bp.route("/filter-options", methods=["GET"])
def filter_options():
    """
    Get available filter options based on current data.
    Returns unique values for each filterable dimension.

    Query params:
      - schema: 'v1' (default) returns both old and new fields, 'v2' returns only camelCase + enums
    """
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, distinct
    from services.data_processor import _get_market_segment
    from schemas.api_contract import serialize_filter_options, PropertyAgeBucket

    # Schema version: v1 (dual-mode) or v2 (strict)
    schema_version = request.args.get('schema', 'v1')
    include_deprecated = (schema_version != 'v2')

    try:
        # Base filter to exclude outliers
        outlier_filter = Transaction.outlier_filter()

        # Get distinct values for each dimension (excluding outliers)
        districts = [d[0] for d in db.session.query(distinct(Transaction.district)).filter(outlier_filter).order_by(Transaction.district).all()]
        bedrooms = [b[0] for b in db.session.query(distinct(Transaction.bedroom_count)).filter(outlier_filter).order_by(Transaction.bedroom_count).all() if b[0]]
        sale_types = [s[0] for s in db.session.query(distinct(Transaction.sale_type)).filter(outlier_filter).all() if s[0]]
        projects = [p[0] for p in db.session.query(distinct(Transaction.project_name)).filter(outlier_filter).order_by(Transaction.project_name).limit(500).all() if p[0]]

        # Get date range (excluding outliers)
        min_date = db.session.query(func.min(Transaction.transaction_date)).filter(outlier_filter).scalar()
        max_date = db.session.query(func.max(Transaction.transaction_date)).filter(outlier_filter).scalar()

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
            region = _get_market_segment(d)
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

        return jsonify(serialize_filter_options(
            districts=districts,
            regions=regions,
            bedrooms=bedrooms,
            sale_types=sale_types,
            projects=projects[:100],  # Limit project list
            date_range=date_range,
            psf_range=psf_range,
            size_range=size_range,
            tenures=tenures,
            property_age_buckets=PropertyAgeBucket.ALL,
            include_deprecated=include_deprecated
        ))
    except Exception as e:
        print(f"GET /api/filter-options ERROR: {e}")
        return jsonify({"error": str(e)}), 500
