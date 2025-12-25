"""
Analytics API Routes - Lightweight read-only endpoints

All routes now read from PreComputedStats table - no calculations, no Pandas.
Fast and efficient.

New unified dashboard endpoint uses SQL CTEs for high-performance aggregation.
"""

from flask import Blueprint, request, jsonify
import time
from services.analytics_reader import get_reader

analytics_bp = Blueprint('analytics', __name__)
reader = get_reader()


# ============================================================================
# UNIFIED DASHBOARD ENDPOINT (HIGH-PERFORMANCE)
# ============================================================================

@analytics_bp.route("/dashboard", methods=["GET", "POST"])
def dashboard():
    """
    Unified dashboard endpoint - returns all chart datasets in one response.

    This is the recommended endpoint for the Power BI-style dashboard.
    Uses SQL CTEs for efficient aggregation without loading data into memory.

    Supports both GET (query params) and POST (JSON body).

    Query params / JSON body:
      Filters:
        - date_from: YYYY-MM-DD
        - date_to: YYYY-MM-DD
        - district: comma-separated districts (D01,D02,...)
        - bedroom: comma-separated bedroom counts (2,3,4)
        - segment: CCR, RCR, OCR
        - sale_type: 'New Sale' or 'Resale'
        - psf_min, psf_max: PSF range
        - size_min, size_max: sqft range
        - tenure: Freehold, 99-year, 999-year
        - project: project name filter (partial match)

      Options:
        - panels: comma-separated panels to return
                  (time_series, volume_by_location, price_histogram, bedroom_mix,
                   sale_type_breakdown, summary)
        - time_grain: year, quarter, month (default: month)
        - location_grain: region, district, project (default: region)
        - histogram_bins: number of bins for price histogram (default: 20, max: 50)
        - skip_cache: if 'true', bypass cache

    Returns:
      {
        "data": {
          "time_series": [...],
          "volume_by_location": [...],
          "price_histogram": [...],
          "bedroom_mix": [...],
          "summary": {...}
        },
        "meta": {
          "cache_hit": bool,
          "elapsed_ms": float,
          "filters_applied": {...},
          "total_records_matched": int
        }
      }

    Example:
      GET /api/dashboard?district=D09,D10&bedroom=2,3,4&time_grain=quarter
      GET /api/dashboard?segment=CCR&panels=time_series,summary
    """
    from services.dashboard_service import get_dashboard_data, ValidationError, get_cache_stats

    start = time.time()

    try:
        # Parse parameters from GET query string or POST JSON body
        if request.method == 'POST' and request.is_json:
            body = request.get_json()
            filters = body.get('filters', {})
            panels_param = body.get('panels', [])
            options = body.get('options', {})
            skip_cache = body.get('skip_cache', False)
        else:
            # Parse from query params
            filters = {}
            options = {}

            # Date filters
            if request.args.get('date_from'):
                filters['date_from'] = request.args.get('date_from')
            if request.args.get('date_to'):
                filters['date_to'] = request.args.get('date_to')

            # District filter
            if request.args.get('district'):
                districts = [d.strip() for d in request.args.get('district').split(',') if d.strip()]
                filters['districts'] = districts

            # Bedroom filter
            if request.args.get('bedroom'):
                bedrooms = [int(b.strip()) for b in request.args.get('bedroom').split(',') if b.strip()]
                filters['bedrooms'] = bedrooms

            # Segment filter - supports comma-separated values (e.g., "CCR,RCR")
            if request.args.get('segment'):
                segments = [s.strip().upper() for s in request.args.get('segment').split(',') if s.strip()]
                filters['segments'] = segments

            # Sale type filter
            if request.args.get('sale_type'):
                filters['sale_type'] = request.args.get('sale_type')

            # PSF range
            if request.args.get('psf_min'):
                filters['psf_min'] = float(request.args.get('psf_min'))
            if request.args.get('psf_max'):
                filters['psf_max'] = float(request.args.get('psf_max'))

            # Size range
            if request.args.get('size_min'):
                filters['size_min'] = float(request.args.get('size_min'))
            if request.args.get('size_max'):
                filters['size_max'] = float(request.args.get('size_max'))

            # Tenure filter
            if request.args.get('tenure'):
                filters['tenure'] = request.args.get('tenure')

            # Property age filter (years since TOP/lease start)
            # Note: This only applies to leasehold properties (freehold excluded)
            if request.args.get('property_age_min'):
                filters['property_age_min'] = int(request.args.get('property_age_min'))
            if request.args.get('property_age_max'):
                filters['property_age_max'] = int(request.args.get('property_age_max'))

            # Project filter - supports both partial match (search) and exact match (drill-through)
            if request.args.get('project_exact'):
                filters['project_exact'] = request.args.get('project_exact')
            elif request.args.get('project'):
                filters['project'] = request.args.get('project')

            # Panels
            panels_param = request.args.get('panels', '')
            if panels_param:
                panels_param = [p.strip() for p in panels_param.split(',') if p.strip()]
            else:
                panels_param = None  # Will use default

            # Options
            if request.args.get('time_grain'):
                options['time_grain'] = request.args.get('time_grain')
            if request.args.get('location_grain'):
                options['location_grain'] = request.args.get('location_grain')
            if request.args.get('histogram_bins'):
                options['histogram_bins'] = int(request.args.get('histogram_bins'))
            if request.args.get('show_full_range'):
                options['show_full_range'] = request.args.get('show_full_range', '').lower() == 'true'

            skip_cache = request.args.get('skip_cache', '').lower() == 'true'

        # Get dashboard data
        result = get_dashboard_data(
            filters=filters,
            panels=panels_param if panels_param else None,
            options=options if options else None,
            skip_cache=skip_cache
        )

        # SECURITY: Mask project names in volume_by_location for free users
        # when location_grain=project
        from utils.subscription import is_premium_user
        if not is_premium_user() and options.get('location_grain') == 'project':
            if 'volume_by_location' in result.get('data', {}):
                # Mask project names to generic format: "Project #1", "Project #2", etc.
                for i, item in enumerate(result['data']['volume_by_location'], 1):
                    item['location'] = f"Project #{i}"
                # Add flag so frontend knows data is masked
                result['meta']['data_masked'] = True

        elapsed = time.time() - start
        print(f"GET /api/dashboard took: {elapsed:.4f} seconds (cache_hit: {result['meta'].get('cache_hit', False)})")

        return jsonify(result)

    except ValidationError as e:
        elapsed = time.time() - start
        print(f"GET /api/dashboard validation error (took {elapsed:.4f}s): {e}")
        return jsonify({
            "error": "Validation error",
            "details": e.args[0] if e.args else str(e)
        }), 400

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/dashboard ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": str(e)
        }), 500


@analytics_bp.route("/dashboard/cache", methods=["GET", "DELETE"])
def dashboard_cache():
    """
    Dashboard cache management endpoint.

    GET: Return cache statistics
    DELETE: Clear cache
    """
    from services.dashboard_service import get_cache_stats, clear_dashboard_cache

    if request.method == 'DELETE':
        clear_dashboard_cache()
        return jsonify({"status": "cache cleared"})

    return jsonify(get_cache_stats())


@analytics_bp.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, or_

    try:
        # Total records in database
        total_count = db.session.query(Transaction).count()

        # Active records (non-outliers) - this is what analytics use
        active_count = db.session.query(Transaction).filter(
            or_(Transaction.is_outlier == False, Transaction.is_outlier.is_(None))
        ).count()

        # Outlier count - directly from database, always accurate
        outlier_count = db.session.query(Transaction).filter(
            Transaction.is_outlier == True
        ).count()

        metadata = reader.get_metadata()

        # Get min and max transaction dates from non-outlier records
        min_date_result = db.session.query(func.min(Transaction.transaction_date)).filter(
            or_(Transaction.is_outlier == False, Transaction.is_outlier.is_(None))
        ).scalar()
        max_date_result = db.session.query(func.max(Transaction.transaction_date)).filter(
            or_(Transaction.is_outlier == False, Transaction.is_outlier.is_(None))
        ).scalar()

        # If transaction_date is None, try contract_date
        if min_date_result is None:
            min_date_result = db.session.query(func.min(Transaction.contract_date)).scalar()
        if max_date_result is None:
            max_date_result = db.session.query(func.max(Transaction.contract_date)).scalar()

        return jsonify({
            "status": "healthy",
            "data_loaded": active_count > 0,
            "row_count": active_count,  # Non-outlier records (used by analytics)
            "total_records": total_count,  # All records in database
            "outliers_excluded": outlier_count,  # Direct count from is_outlier=true
            "total_records_removed": outlier_count,  # For backward compatibility
            "stats_computed": metadata.get("last_updated") is not None,
            "last_updated": metadata.get("last_updated"),
            "min_date": min_date_result.isoformat() if min_date_result else None,
            "max_date": max_date_result.isoformat() if max_date_result else None
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500


@analytics_bp.route("/debug/data-status", methods=["GET"])
def debug_data_status():
    """
    Diagnostic endpoint to check data integrity after migration.
    Shows actual counts and date ranges to debug KPI issues.
    """
    from models.transaction import Transaction
    from models.precomputed_stats import PreComputedStats
    from models.database import db
    from sqlalchemy import func, text
    from datetime import datetime, timedelta

    try:
        # Basic counts
        total_count = db.session.query(Transaction).count()

        # Date range from actual data
        date_stats = db.session.query(
            func.min(Transaction.transaction_date),
            func.max(Transaction.transaction_date),
            func.count(Transaction.id).filter(Transaction.transaction_date.isnot(None)),
            func.count(Transaction.id).filter(Transaction.transaction_date.is_(None))
        ).first()

        min_date, max_date, with_dates, without_dates = date_stats

        # Last 30 days check (from today)
        today = datetime.now().date()
        thirty_days_ago = today - timedelta(days=30)

        last_30_days = db.session.query(func.count(Transaction.id)).filter(
            Transaction.transaction_date >= thirty_days_ago,
            Transaction.transaction_date <= today
        ).scalar()

        # Last 30 days by sale type
        new_sales_30d = db.session.query(func.count(Transaction.id)).filter(
            Transaction.transaction_date >= thirty_days_ago,
            Transaction.transaction_date <= today,
            Transaction.sale_type == 'New Sale'
        ).scalar()

        resales_30d = db.session.query(func.count(Transaction.id)).filter(
            Transaction.transaction_date >= thirty_days_ago,
            Transaction.transaction_date <= today,
            Transaction.sale_type == 'Resale'
        ).scalar()

        # Check sale_type values
        sale_types = db.session.query(
            Transaction.sale_type,
            func.count(Transaction.id)
        ).group_by(Transaction.sale_type).all()

        # Check precomputed_stats metadata
        metadata_record = PreComputedStats.query.filter_by(stat_key='_metadata').first()
        metadata = None
        if metadata_record:
            import json
            try:
                metadata = json.loads(metadata_record.stat_value) if isinstance(metadata_record.stat_value, str) else metadata_record.stat_value
            except:
                metadata = {"error": "could not parse"}

        return jsonify({
            "status": "ok",
            "total_transactions": total_count,
            "date_range": {
                "min_date": min_date.isoformat() if min_date else None,
                "max_date": max_date.isoformat() if max_date else None,
                "records_with_date": with_dates,
                "records_without_date": without_dates
            },
            "last_30_days": {
                "query_range": f"{thirty_days_ago.isoformat()} to {today.isoformat()}",
                "total_count": last_30_days,
                "new_sales": new_sales_30d,
                "resales": resales_30d
            },
            "sale_type_breakdown": {st[0] if st[0] else "NULL": st[1] for st in sale_types},
            "precomputed_metadata": metadata
        })
    except Exception as e:
        import traceback
        return jsonify({
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@analytics_bp.route("/admin/update-metadata", methods=["POST"])
def admin_update_metadata():
    """
    Manually update the precomputed metadata with outlier/validation counts.

    This is useful after database migration when the metadata wasn't preserved.

    POST body (JSON):
        {
            "outliers_excluded": 1234,
            "duplicates_removed": 0,
            "invalid_removed": 0
        }

    All fields are optional. Only provided fields will be updated.
    """
    from models.precomputed_stats import PreComputedStats
    from models.transaction import Transaction
    from models.database import db
    from datetime import datetime
    import json

    try:
        data = request.get_json() or {}

        # Get existing metadata or create new
        existing = PreComputedStats.get_stat('_metadata') or {}

        # Get current transaction count
        total_count = db.session.query(Transaction).count()

        # Update with provided values
        invalid_removed = data.get('invalid_removed', existing.get('invalid_removed', 0))
        duplicates_removed = data.get('duplicates_removed', existing.get('duplicates_removed', 0))
        outliers_excluded = data.get('outliers_excluded', existing.get('outliers_excluded', 0))
        total_records_removed = invalid_removed + duplicates_removed + outliers_excluded

        # Build updated metadata
        updated_metadata = {
            'last_updated': existing.get('last_updated', datetime.utcnow().isoformat()),
            'row_count': total_count,
            'invalid_removed': invalid_removed,
            'duplicates_removed': duplicates_removed,
            'outliers_excluded': outliers_excluded,
            'total_records_removed': total_records_removed,
            'computed_at': existing.get('computed_at', datetime.utcnow().isoformat()),
            'manually_updated_at': datetime.utcnow().isoformat()
        }

        # Save to database
        PreComputedStats.set_stat('_metadata', updated_metadata, total_count)

        return jsonify({
            "status": "ok",
            "message": "Metadata updated successfully",
            "metadata": updated_metadata
        })
    except Exception as e:
        import traceback
        return jsonify({
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@analytics_bp.route("/admin/filter-outliers", methods=["GET", "POST"])
def filter_outliers_endpoint():
    """
    Filter outliers from the database using IQR method.

    GET: Preview outliers (dry run) - shows what would be removed
    POST: Actually remove outliers and recompute stats

    Query params:
      - confirm: must be 'yes' for POST to actually delete (safety check)

    Returns IQR statistics and outlier count.
    """
    from models.transaction import Transaction
    from models.database import db
    from services.data_validation import (
        calculate_iqr_bounds,
        count_outliers,
        get_sample_outliers,
        filter_outliers_sql
    )
    from services.data_computation import recompute_all_stats

    try:
        before_count = db.session.query(Transaction).count()

        # Use centralized data_validation functions
        lower_bound, upper_bound, stats = calculate_iqr_bounds()
        outlier_count = count_outliers(lower_bound, upper_bound)
        sample_outliers = get_sample_outliers(lower_bound, upper_bound)

        response_data = {
            "iqr_statistics": stats,
            "current_count": before_count,
            "outlier_count": outlier_count,
            "sample_outliers": sample_outliers
        }

        # POST with confirm=yes actually deletes
        if request.method == 'POST':
            confirm = request.args.get('confirm', '')
            if confirm.lower() != 'yes':
                response_data["error"] = "Add ?confirm=yes to actually delete outliers"
                response_data["action"] = "none"
                return jsonify(response_data)

            if outlier_count == 0:
                response_data["action"] = "none"
                response_data["message"] = "No outliers to remove"
                return jsonify(response_data)

            # Use centralized filter function
            outliers_removed, filter_stats = filter_outliers_sql()

            # Recompute stats with outlier count
            recompute_all_stats({'outliers_removed': outliers_removed})

            response_data["action"] = "deleted"
            response_data["outliers_removed"] = outliers_removed
            response_data["new_count"] = filter_stats.get('after_count', before_count - outliers_removed)
            response_data["message"] = f"Successfully removed {outliers_removed} outliers and recomputed stats"

            return jsonify(response_data)

        # GET just previews
        response_data["action"] = "preview"
        response_data["message"] = "Use POST with ?confirm=yes to delete outliers"
        return jsonify(response_data)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": str(e)
        }), 500


@analytics_bp.route("/resale_stats", methods=["GET"])
def resale_stats():
    """
    Get resale statistics for 2, 3, 4-Bedroom condos.
    
    Query params:
      - district: comma-separated districts to filter (optional)
      - segment: Market segment filter ("CCR", "RCR", or "OCR") (optional)
    
    Note: Currently returns pre-computed stats. Filtering by districts/segment
    is accepted but may not be fully applied if pre-computed stats don't have variants.
    For full filtering support, consider switching to live computation.
    """
    start = time.time()
    
    # API Parameter Convention: Always use singular form (district, bedroom, segment)
    # Values can be comma-separated for multiple selections
    districts_param = request.args.get("district")
    segment = request.args.get("segment")

    # Note: reader.get_resale_stats() accepts these params but pre-computed stats
    # may not have filtered variants. For now, return what's available.
    # TODO: Consider switching to live computation for full filtering support
    try:
        stats = reader.get_resale_stats(districts=districts_param, segment=segment)
        elapsed = time.time() - start
        print(f"GET /api/resale_stats took: {elapsed:.4f} seconds")
        return jsonify(stats)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/resale_stats ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/transactions", methods=["GET"])
def transactions():
    """Get detailed transaction list - still uses database query for flexibility."""
    start = time.time()
    
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import and_
    
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    districts_param = request.args.get("district")  # Singular form, comma-separated
    bedroom_param = request.args.get("bedroom", "2,3,4")
    limit_param = request.args.get("limit", "200000")
    segment = request.args.get("segment")
    
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
        limit = int(limit_param)
    except ValueError:
        return jsonify({"error": "Invalid parameter"}), 400

    # Use active_query() to exclude outliers
    query = Transaction.active_query()

    # Apply filters
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
        normalized = []
        for d in districts:
            d = str(d).strip().upper()
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        query = query.filter(Transaction.district.in_(normalized))
    
    if bedroom_types:
        query = query.filter(Transaction.bedroom_count.in_(bedroom_types))
    
    if start_date:
        from datetime import datetime
        start_dt = datetime.strptime(start_date + "-01", "%Y-%m-%d")
        query = query.filter(Transaction.transaction_date >= start_dt)
    
    if end_date:
        from datetime import datetime
        from calendar import monthrange
        year, month = map(int, end_date.split("-"))
        last_day = monthrange(year, month)[1]
        end_dt = datetime(year, month, last_day)
        query = query.filter(Transaction.transaction_date <= end_dt)
    
    # Segment filter (supports comma-separated values e.g., "CCR,RCR")
    if segment:
        from services.data_processor import _get_market_segment
        segments = [s.strip().upper() for s in segment.split(',') if s.strip()]
        all_districts = db.session.query(Transaction.district).distinct().all()
        segment_districts = [
            d[0] for d in all_districts
            if _get_market_segment(d[0]) in segments
        ]
        query = query.filter(Transaction.district.in_(segment_districts))

    transactions = query.limit(limit).all()

    # SECURITY: Use tier-aware serialization
    from utils.subscription import serialize_transactions
    result = serialize_transactions(transactions)

    elapsed = time.time() - start
    print(f"GET /api/transactions took: {elapsed:.4f} seconds (returned {len(result)} rows)")
    return jsonify({
        "count": len(result),
        "transactions": result
    })


@analytics_bp.route("/price_trends", methods=["GET"])
def price_trends():
    """Get price trends by district and month, broken down by bedroom type."""
    start = time.time()
    
    try:
        data = reader.get_price_trends()
        elapsed = time.time() - start
        print(f"GET /api/price_trends took: {elapsed:.4f} seconds")
        return jsonify(data)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/price_trends ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/total_volume", methods=["GET"])
def total_volume():
    """Get total transacted amount by district, broken down by bedroom type."""
    start = time.time()
    
    try:
        data = reader.get_total_volume_by_district()
        elapsed = time.time() - start
        print(f"GET /api/total_volume took: {elapsed:.4f} seconds")
        return jsonify(data)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/total_volume ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/avg_psf", methods=["GET"])
def avg_psf():
    """Get average PSF by district, broken down by bedroom type."""
    start = time.time()
    
    try:
        data = reader.get_avg_psf_by_district()
        elapsed = time.time() - start
        print(f"GET /api/avg_psf took: {elapsed:.4f} seconds")
        return jsonify(data)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/avg_psf ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/projects_by_district", methods=["GET"])
def projects_by_district():
    """Get project-level volume and quantity breakdown for a specific district."""
    start = time.time()
    from services.data_processor import get_project_aggregation_by_district

    district = request.args.get("district")
    bedroom_param = request.args.get("bedroom", "2,3,4")
    segment = request.args.get("segment")  # Optional: CCR, RCR, OCR

    if not district:
        return jsonify({"error": "district parameter is required"}), 400

    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400

    # Normalize district
    d = str(district).strip().upper()
    if not d.startswith("D"):
        d = f"D{d.zfill(2)}"

    try:
        data = get_project_aggregation_by_district(district=d, bedroom_types=bedroom_types, segment=segment)
        
        # Data validation: Ensure all projects have required fields
        if "projects" in data:
            validated_projects = []
            total_project_volume = 0
            total_project_quantity = 0
            
            for project in data["projects"]:
                # Validate required fields exist
                if "project_name" not in project or not project["project_name"]:
                    continue  # Skip invalid projects
                
                # Ensure numeric fields are present (default to 0 if missing)
                for bed in bedroom_types:
                    bed_label = f"{bed}b"
                    if bed_label not in project:
                        project[bed_label] = 0
                    if f"{bed_label}_count" not in project:
                        project[f"{bed_label}_count"] = 0
                
                # Ensure totals are calculated if missing
                if "total" not in project or project["total"] is None:
                    project["total"] = sum(project.get(f"{bed}b", 0) for bed in bedroom_types)
                if "total_quantity" not in project or project["total_quantity"] is None:
                    project["total_quantity"] = sum(project.get(f"{bed}b_count", 0) for bed in bedroom_types)
                
                total_project_volume += project["total"]
                total_project_quantity += project["total_quantity"]
                validated_projects.append(project)
            
            data["projects"] = validated_projects
            data["project_count"] = len(validated_projects)
            
            # Validation: Sum of all project totals should match district total
            # Get district total from total_volume endpoint for comparison
            from services.data_processor import get_total_volume_by_district
            district_data = get_total_volume_by_district(bedroom_types=bedroom_types, districts=[d], segment=segment)
            district_row = None
            if "data" in district_data and len(district_data["data"]) > 0:
                district_row = next((row for row in district_data["data"] if row.get("district") == d), None)
            
            if district_row:
                district_total = district_row.get("total", 0)
                district_qty = district_row.get("total_quantity", 0)
                volume_diff = abs(district_total - total_project_volume)
                qty_diff = abs(district_qty - total_project_quantity)
                
                # Log warning if there's a significant discrepancy (> 1% or > $1000)
                if volume_diff > max(1000, district_total * 0.01) or qty_diff > max(1, district_qty * 0.01):
                    print(f"WARNING: District {d} aggregation mismatch - District total: ${district_total:,.0f}, Project sum: ${total_project_volume:,.0f}, Diff: ${volume_diff:,.0f}")
                    print(f"         District qty: {district_qty}, Project sum: {total_project_quantity}, Diff: {qty_diff}")
                else:
                    print(f"District {d} validation passed - Volume: ${total_project_volume:,.0f}, Qty: {total_project_quantity}")
        
        elapsed = time.time() - start
        print(f"GET /api/projects_by_district took: {elapsed:.4f} seconds (returned {data.get('project_count', 0)} projects)")
        return jsonify(data)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/projects_by_district ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/price_projects_by_district", methods=["GET"])
def price_projects_by_district():
    """
    Project-level price / PSF quartiles for a given district and timeframe.
    Query params:
      - district: e.g. D10
      - bedroom: comma-separated bedroom counts, e.g. 2,3,4
      - months: timeframe length (default 15)
    """
    from models.transaction import Transaction
    from models.database import db
    from datetime import datetime, timedelta
    from sqlalchemy import func
    
    district = request.args.get("district")
    if not district:
        return jsonify({"error": "district parameter is required"}), 400
    
    bedroom_param = request.args.get("bedroom", "2,3,4")
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    months_param = request.args.get("months", "15")
    try:
        months = int(months_param)
    except ValueError:
        months = 15
    
    # Normalize district
    d = str(district).strip().upper()
    if not d.startswith("D"):
        d = f"D{d.zfill(2)}"
    
    try:
        # Calculate date cutoff
        cutoff_date = datetime.now() - timedelta(days=months * 30)
        
        # Query transactions
        transactions = db.session.query(Transaction).filter(
            Transaction.district == d,
            Transaction.bedroom_count.in_(bedroom_types),
            Transaction.transaction_date >= cutoff_date
        ).all()
        
        # Group by project and calculate quartiles
        from collections import defaultdict
        project_data = defaultdict(lambda: {'prices': [], 'psfs': [], 'sale_types': []})
        
        for txn in transactions:
            project_data[txn.project_name]['prices'].append(txn.price)
            project_data[txn.project_name]['psfs'].append(txn.psf)
            if hasattr(txn, 'sale_type') and txn.sale_type:
                project_data[txn.project_name]['sale_types'].append(txn.sale_type)
        
        projects = []
        for project_name, data in project_data.items():
            if len(data['prices']) < 3:
                continue
            
            prices = sorted(data['prices'])
            psfs = sorted(data['psfs'])
            
            def quartile(arr, q):
                idx = int(len(arr) * q)
                return arr[idx] if idx < len(arr) else arr[-1]
            
            # Determine sale_type_label (New Launch vs Resale)
            sale_type_label = None
            if data['sale_types']:
                new_sale_count = sum(1 for st in data['sale_types'] if st == 'New Sale')
                resale_count = sum(1 for st in data['sale_types'] if st == 'Resale')
                if new_sale_count > resale_count:
                    sale_type_label = 'New Launch'
                elif resale_count > 0:
                    sale_type_label = 'Resale'
            
            projects.append({
                'project_name': project_name,
                'price_25th': quartile(prices, 0.25),
                'price_median': quartile(prices, 0.5),
                'price_75th': quartile(prices, 0.75),
                'psf_25th': quartile(psfs, 0.25),
                'psf_median': quartile(psfs, 0.5),
                'psf_75th': quartile(psfs, 0.75),
                'count': len(data['prices']),
                'sale_type_label': sale_type_label
            })
        
        projects.sort(key=lambda x: x['count'], reverse=True)
        
        return jsonify({"projects": projects})
    except Exception as e:
        print(f"GET /api/price_projects_by_district ERROR: {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/comparable_value_analysis", methods=["GET"])
def comparable_value_analysis():
    """
    Comparable Value Analysis (Buy Box) endpoint.
    Query params:
      - target_price: center of price band
      - band: +/- band around target (default 100000)
      - bedroom: comma-separated bedroom counts (default 2,3,4)
      - district: optional comma-separated list of districts
    """
    from models.transaction import Transaction
    from models.database import db
    
    try:
        target_price = float(request.args.get("target_price", "2500000"))
    except ValueError:
        target_price = 2500000.0
    
    try:
        band = float(request.args.get("band", "100000"))
    except ValueError:
        band = 100000.0
    
    bedroom_param = request.args.get("bedroom", "2,3,4")
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    districts_param = request.args.get("district", "").strip()  # Singular form, comma-separated
    districts = None
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
        normalized = []
        for d in districts:
            d = str(d).strip().upper()
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        districts = normalized

    min_lease_param = request.args.get("min_lease")
    min_lease = None
    if min_lease_param:
        try:
            min_lease = int(min_lease_param)
        except ValueError:
            min_lease = None
    
    sale_type = request.args.get("sale_type")  # "New Launch" or "Resale"
    
    try:
        # Use active_query() to exclude outliers
        query = Transaction.active_query().filter(
            Transaction.price >= (target_price - band),
            Transaction.price <= (target_price + band),
            Transaction.bedroom_count.in_(bedroom_types)
        )
        
        if districts:
            query = query.filter(Transaction.district.in_(districts))
        
        if min_lease:
            query = query.filter(Transaction.remaining_lease >= min_lease)
        
        if sale_type:
            query = query.filter(func.lower(Transaction.sale_type) == sale_type.lower())

        transactions = query.limit(100).all()

        # Calculate summary stats from RAW data (before serialization)
        # Summary stats are aggregates and can be shown to all users
        if transactions:
            prices = [t.price for t in transactions]
            psfs = [t.psf for t in transactions]
            summary = {
                'count': len(transactions),
                'price_median': sorted(prices)[len(prices)//2] if prices else None,
                'psf_median': sorted(psfs)[len(psfs)//2] if psfs else None
            }
        else:
            summary = {'count': 0, 'price_median': None, 'psf_median': None}

        # SECURITY: Use tier-aware serialization for individual points
        from utils.subscription import serialize_transactions
        points = serialize_transactions(transactions)

        return jsonify({
            'points': points,
            'competitors': [],  # Can be computed if needed
            'summary': summary
        })
    except Exception as e:
        print(f"GET /api/comparable_value_analysis ERROR: {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/districts", methods=["GET"])
def get_districts():
    """Get list of all districts with transactions."""
    start = time.time()
    
    try:
        districts_data = reader.get_available_districts()
        elapsed = time.time() - start
        print(f"GET /api/districts took: {elapsed:.4f} seconds")
        return jsonify(districts_data)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/districts ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/market_stats", methods=["GET"])
def market_stats():
    """
    Get dual-view market analysis: Short-Term vs Long-Term months.
    
    Query params:
      - segment: Market segment filter ("CCR", "RCR", or "OCR") (optional)
      - short_months: Short-term period in months (default: 3)
      - long_months: Long-term period in months (default: 15)
    """
    start = time.time()
    
    # Parse segment parameter (optional)
    segment = request.args.get("segment")
    
    # Parse month parameters
    short_months_param = request.args.get("short_months", "3")
    long_months_param = request.args.get("long_months", "15")
    try:
        short_months = int(short_months_param)
        long_months = int(long_months_param)
    except ValueError:
        return jsonify({"error": "Invalid short_months or long_months parameter"}), 400
    
    try:
        # Use data_processor function which supports segment and months filtering
        from services.data_processor import get_market_stats
        
        stats = get_market_stats(segment=segment, short_months=short_months, long_months=long_months)
        
        elapsed = time.time() - start
        print(f"GET /api/market_stats took: {elapsed:.4f} seconds")
        return jsonify(stats)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/market_stats ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/price_trends_by_district", methods=["GET"])
def price_trends_by_district():
    """Get median price trends over time by district (top N districts)."""
    start = time.time()
    
    try:
        data = reader.get_price_trends_by_district()
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_district took: {elapsed:.4f} seconds")
        return jsonify(data)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_district ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/market_stats_by_district", methods=["GET"])
def market_stats_by_district():
    """
    Get dual-view market analysis by district: Short-Term vs Long-Term months.
    
    Query params:
      - bedroom: comma-separated bedroom counts, e.g. 2,3,4 (default: 2,3,4)
      - district: comma-separated districts to filter (optional)
      - segment: Market segment filter ("CCR", "RCR", or "OCR") (optional)
      - short_months: Short-term period in months (default: 3)
      - long_months: Long-term period in months (default: 15)
    """
    start = time.time()
    
    # Parse bedroom parameter
    bedroom_param = request.args.get("bedroom", "2,3,4")
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    # Parse district parameter (singular form, comma-separated for multiple)
    districts_param = request.args.get("district")
    districts = None
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
        # Normalize districts
        normalized = []
        for d in districts:
            d = str(d).strip().upper()
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        districts = normalized

    # Parse segment parameter (optional)
    segment = request.args.get("segment")

    # Parse month parameters
    short_months_param = request.args.get("short_months", "3")
    long_months_param = request.args.get("long_months", "15")
    try:
        short_months = int(short_months_param)
        long_months = int(long_months_param)
    except ValueError:
        return jsonify({"error": "Invalid short_months or long_months parameter"}), 400
    
    try:
        # Use data_processor function which supports bedroom filtering
        from services.data_processor import get_market_stats_by_district
        
        stats = get_market_stats_by_district(
            bedroom_types=bedroom_types,
            districts=districts,
            short_months=short_months,
            long_months=long_months,
            segment=segment
        )
        
        elapsed = time.time() - start
        print(f"GET /api/market_stats_by_district took: {elapsed:.4f} seconds (bedrooms: {bedroom_types})")
        return jsonify(stats)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/market_stats_by_district ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/sale_type_trends", methods=["GET"])
def sale_type_trends():
    """
    Get transaction counts by sale type (New Sale vs Resale) over time by quarter.
    
    Query params:
      - district: comma-separated districts to filter (optional)
      - segment: Market segment filter ("CCR", "RCR", or "OCR") (optional)
    """
    start = time.time()

    # Parse district parameter (singular form, comma-separated for multiple)
    districts_param = request.args.get("district")
    districts = None
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
        # Normalize districts
        normalized = []
        for d in districts:
            d = str(d).strip().upper()
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        districts = normalized

    # Parse segment parameter (optional)
    segment = request.args.get("segment")

    try:
        # Use data_processor function which supports filtering
        from services.data_processor import get_sale_type_trends
        
        trends = get_sale_type_trends(districts=districts, segment=segment)
        
        elapsed = time.time() - start
        print(f"GET /api/sale_type_trends took: {elapsed:.4f} seconds")
        return jsonify(trends)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/sale_type_trends ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/price_trends_by_sale_type", methods=["GET"])
def price_trends_by_sale_type():
    """
    Get median price trends by sale type (New Sale vs Resale) over time by quarter, separated by bedroom type.
    
    Query params:
      - bedroom: comma-separated bedroom counts, e.g. 2,3,4 (default: 2,3,4)
      - district: comma-separated districts to filter (optional)
      - segment: Market segment filter ("CCR", "RCR", or "OCR") (optional)
    """
    start = time.time()
    
    # Parse bedroom parameter
    bedroom_param = request.args.get("bedroom", "2,3,4")
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    # Parse district parameter (singular form, comma-separated for multiple)
    districts_param = request.args.get("district")
    districts = None
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
        # Normalize districts
        normalized = []
        for d in districts:
            d = str(d).strip().upper()
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        districts = normalized

    # Parse segment parameter (optional)
    segment = request.args.get("segment")

    try:
        # Use data_processor function which supports filtering
        from services.data_processor import get_price_trends_by_sale_type
        
        trends = get_price_trends_by_sale_type(
            bedroom_types=bedroom_types,
            districts=districts,
            segment=segment
        )
        
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_sale_type took: {elapsed:.4f} seconds (bedrooms: {bedroom_types})")
        return jsonify(trends)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_sale_type ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/price_trends_by_region", methods=["GET"])
def price_trends_by_region():
    """
    Get median price trends by region (CCR, RCR, OCR) over time by quarter.
    
    Query params:
      - bedroom: comma-separated bedroom counts, e.g. 2,3,4 (default: 2,3,4)
      - district: comma-separated districts to filter (optional, but ignored for region analysis)
    """
    start = time.time()
    
    # Parse bedroom parameter
    bedroom_param = request.args.get("bedroom", "2,3,4")
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    # Note: districts parameter is accepted but ignored for region analysis
    # (region analysis needs all districts to calculate CCR/RCR/OCR)
    
    try:
        # Use data_processor function which supports bedroom filtering
        from services.data_processor import get_price_trends_by_region
        
        trends = get_price_trends_by_region(bedroom_types=bedroom_types, districts=None)
        
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_region took: {elapsed:.4f} seconds (bedrooms: {bedroom_types})")
        return jsonify(trends)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_region ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/aggregate", methods=["GET"])
def aggregate():
    """
    Flexible aggregation endpoint for Power BI-style dynamic filtering.
    Uses SQL-level aggregation for memory efficiency.

    Now includes server-side caching for faster repeated queries.

    API Parameter Convention:
      All filter parameters use SINGULAR form with comma-separated values for multiple selections.
      Example: ?district=D01,D02&bedroom=2,3 (NOT ?districts=...)

    Query params:
      - group_by: comma-separated dimensions (month, quarter, year, district, bedroom, sale_type, project, region, floor_level)
      - metrics: comma-separated metrics (count, median_psf, avg_psf, total_value, median_price, avg_price, min_psf, max_psf, price_25th, price_75th, psf_25th, psf_75th, median_psf_actual)
      - district: comma-separated districts (D01,D02,...)
      - bedroom: comma-separated bedroom counts (2,3,4)
      - segment: CCR, RCR, OCR (filters by market segment)
      - sale_type: New Sale, Resale
      - date_from: YYYY-MM-DD
      - date_to: YYYY-MM-DD
      - psf_min: minimum PSF
      - psf_max: maximum PSF
      - size_min: minimum sqft
      - size_max: maximum sqft
      - tenure: Freehold, 99-year, 999-year
      - project: project name filter (partial match)
      - skip_cache: if 'true', bypass cache

    IMPORTANT - Segment vs Region:
      - Input param: "segment" (CCR, RCR, OCR) - filters transactions by market segment
      - When group_by includes "region", output field is labeled "region" (not "segment")
      - Both refer to the same concept: URA market segments (CCR/RCR/OCR)
      - This naming reflects: segment=filter param, region=grouping dimension

    Returns:
      {
        "data": [...aggregated results...],
        "meta": {
          "total_records": N,
          "filters_applied": {...},
          "group_by": [...],
          "metrics": [...],
          "cache_hit": bool
        }
      }
    """
    import time
    import hashlib
    import json
    from datetime import datetime
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, and_, or_, extract, cast, String, Integer, literal_column
    from services.data_processor import _get_market_segment
    from services.dashboard_service import _dashboard_cache

    start = time.time()

    # Build cache key from query string
    skip_cache = request.args.get('skip_cache', '').lower() == 'true'
    cache_key = f"aggregate:{request.query_string.decode('utf-8')}"

    # Check cache first
    if not skip_cache:
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            elapsed = time.time() - start
            cached['meta']['cache_hit'] = True
            cached['meta']['elapsed_ms'] = int(elapsed * 1000)
            print(f"GET /api/aggregate CACHE HIT in {elapsed:.4f} seconds")
            return jsonify(cached)

    # Parse parameters
    group_by_param = request.args.get("group_by", "month")
    metrics_param = request.args.get("metrics", "count,avg_psf")

    group_by = [g.strip() for g in group_by_param.split(",") if g.strip()]
    metrics = [m.strip() for m in metrics_param.split(",") if m.strip()]

    # SUBSCRIPTION CHECK: Granularity restriction for free users
    # NOTE: 60-day time restriction removed - using blur paywall instead (all data visible but blurred)
    from utils.subscription import check_granularity_allowed, is_premium_user
    is_premium = is_premium_user()

    allowed, error_msg = check_granularity_allowed(group_by_param, is_premium=is_premium)
    if not allowed:
        return jsonify({
            "error": error_msg,
            "code": "PREMIUM_REQUIRED",
            "upgrade_prompt": "Unlock Unit-Level Precision"
        }), 403

    # Build filter conditions (we'll reuse these)
    # ALWAYS exclude outliers first
    filter_conditions = [Transaction.outlier_filter()]
    filters_applied = {}

    # District filter
    districts_param = request.args.get("district")
    if districts_param:
        districts = [d.strip().upper() for d in districts_param.split(",") if d.strip()]
        normalized = []
        for d in districts:
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        filter_conditions.append(Transaction.district.in_(normalized))
        filters_applied["district"] = normalized

    # Bedroom filter
    bedroom_param = request.args.get("bedroom")
    if bedroom_param:
        bedrooms = [int(b.strip()) for b in bedroom_param.split(",") if b.strip()]
        filter_conditions.append(Transaction.bedroom_count.in_(bedrooms))
        filters_applied["bedroom"] = bedrooms

    # Segment filter (supports comma-separated values e.g., "CCR,RCR")
    segment = request.args.get("segment")
    if segment:
        segments = [s.strip().upper() for s in segment.split(',') if s.strip()]
        all_districts = db.session.query(Transaction.district).distinct().all()
        segment_districts = [
            d[0] for d in all_districts
            if _get_market_segment(d[0]) in segments
        ]
        filter_conditions.append(Transaction.district.in_(segment_districts))
        filters_applied["segment"] = segments

    # Sale type filter (case-insensitive to handle data variations)
    sale_type = request.args.get("sale_type")
    if sale_type:
        # Use case-insensitive comparison to handle 'New Sale', 'NEW SALE', 'new sale', etc.
        filter_conditions.append(func.lower(Transaction.sale_type) == sale_type.lower())
        filters_applied["sale_type"] = sale_type

    # Date range filter
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    if date_from:
        try:
            from_dt = datetime.strptime(date_from, "%Y-%m-%d").date()
            filter_conditions.append(Transaction.transaction_date >= from_dt)
            filters_applied["date_from"] = date_from
        except ValueError:
            pass
    if date_to:
        try:
            to_dt = datetime.strptime(date_to, "%Y-%m-%d").date()
            filter_conditions.append(Transaction.transaction_date <= to_dt)
            filters_applied["date_to"] = date_to
        except ValueError:
            pass

    # PSF range filter
    psf_min = request.args.get("psf_min")
    psf_max = request.args.get("psf_max")
    if psf_min:
        filter_conditions.append(Transaction.psf >= float(psf_min))
        filters_applied["psf_min"] = float(psf_min)
    if psf_max:
        filter_conditions.append(Transaction.psf <= float(psf_max))
        filters_applied["psf_max"] = float(psf_max)

    # Size range filter
    size_min = request.args.get("size_min")
    size_max = request.args.get("size_max")
    if size_min:
        filter_conditions.append(Transaction.area_sqft >= float(size_min))
        filters_applied["size_min"] = float(size_min)
    if size_max:
        filter_conditions.append(Transaction.area_sqft <= float(size_max))
        filters_applied["size_max"] = float(size_max)

    # Tenure filter
    tenure = request.args.get("tenure")
    if tenure:
        tenure_lower = tenure.lower()
        if tenure_lower == "freehold":
            filter_conditions.append(or_(
                Transaction.tenure.ilike("%freehold%"),
                Transaction.remaining_lease == 999
            ))
        elif tenure_lower in ["99-year", "99"]:
            filter_conditions.append(and_(
                Transaction.remaining_lease < 999,
                Transaction.remaining_lease > 0
            ))
        elif tenure_lower in ["999-year", "999"]:
            filter_conditions.append(Transaction.remaining_lease == 999)
        filters_applied["tenure"] = tenure

    # Project filter - supports both partial match (search) and exact match (drill-through)
    # Use project_exact for drill-through views (ProjectDetailPanel)
    # Use project for search functionality (sidebar filter)
    project_exact = request.args.get("project_exact")
    project = request.args.get("project")
    if project_exact:
        # EXACT match - for ProjectDetailPanel drill-through
        filter_conditions.append(Transaction.project_name == project_exact)
        filters_applied["project_exact"] = project_exact
    elif project:
        # PARTIAL match - for search functionality
        filter_conditions.append(Transaction.project_name.ilike(f"%{project}%"))
        filters_applied["project"] = project

    # Get total count first (fast query)
    count_query = db.session.query(func.count(Transaction.id))
    if filter_conditions:
        count_query = count_query.filter(and_(*filter_conditions))
    total_records = count_query.scalar()

    if total_records == 0:
        elapsed = time.time() - start
        return jsonify({
            "data": [],
            "meta": {
                "total_records": 0,
                "filters_applied": filters_applied,
                "group_by": group_by,
                "metrics": metrics,
                "elapsed_ms": int(elapsed * 1000)
            }
        })

    # Build group_by columns for SQL
    group_columns = []
    select_columns = []

    # Map group_by params to SQL expressions
    for g in group_by:
        if g == "district":
            group_columns.append(Transaction.district)
            select_columns.append(Transaction.district.label("district"))
        elif g == "bedroom":
            group_columns.append(Transaction.bedroom_count)
            select_columns.append(Transaction.bedroom_count.label("bedroom"))
        elif g == "sale_type":
            group_columns.append(Transaction.sale_type)
            select_columns.append(Transaction.sale_type.label("sale_type"))
        elif g == "project":
            group_columns.append(Transaction.project_name)
            select_columns.append(Transaction.project_name.label("project"))
        elif g == "year":
            year_col = cast(extract('year', Transaction.transaction_date), Integer)
            group_columns.append(year_col)
            select_columns.append(year_col.label("year"))
        elif g == "month":
            # Format as YYYY-MM - cast to integers for proper grouping
            year_col = cast(extract('year', Transaction.transaction_date), Integer)
            month_col = cast(extract('month', Transaction.transaction_date), Integer)
            # Use a combined expression for grouping
            group_columns.append(year_col)
            group_columns.append(month_col)
            select_columns.append(year_col.label("_year"))
            select_columns.append(month_col.label("_month"))
        elif g == "quarter":
            # Cast year to integer for proper grouping
            year_col = cast(extract('year', Transaction.transaction_date), Integer)
            # Use FLOOR and CAST for proper integer division to calculate quarter
            month_col = extract('month', Transaction.transaction_date)
            quarter_col = cast(func.floor((month_col - 1) / 3) + 1, Integer)
            group_columns.append(year_col)
            group_columns.append(quarter_col)
            select_columns.append(year_col.label("_year"))
            select_columns.append(quarter_col.label("_quarter"))
        elif g == "region":
            # Map districts to regions using CASE statement
            from sqlalchemy import case, literal
            # Import from centralized constants (SINGLE SOURCE OF TRUTH)
            from constants import CCR_DISTRICTS, RCR_DISTRICTS
            region_case = case(
                (Transaction.district.in_(CCR_DISTRICTS), literal('CCR')),
                (Transaction.district.in_(RCR_DISTRICTS), literal('RCR')),
                else_=literal('OCR')
            )
            group_columns.append(region_case)
            select_columns.append(region_case.label("region"))
        elif g == "floor_level":
            # Group by floor level classification
            group_columns.append(Transaction.floor_level)
            select_columns.append(Transaction.floor_level.label("floor_level"))

    # Add metric columns
    if "count" in metrics:
        select_columns.append(func.count(Transaction.id).label("count"))
    if "avg_psf" in metrics or "median_psf" in metrics:
        select_columns.append(func.avg(Transaction.psf).label("avg_psf"))
    if "total_value" in metrics:
        select_columns.append(func.sum(Transaction.price).label("total_value"))
    if "avg_price" in metrics or "median_price" in metrics:
        select_columns.append(func.avg(Transaction.price).label("avg_price"))
    if "min_psf" in metrics:
        select_columns.append(func.min(Transaction.psf).label("min_psf"))
    if "max_psf" in metrics:
        select_columns.append(func.max(Transaction.psf).label("max_psf"))
    if "min_price" in metrics:
        select_columns.append(func.min(Transaction.price).label("min_price"))
    if "max_price" in metrics:
        select_columns.append(func.max(Transaction.price).label("max_price"))
    if "avg_size" in metrics:
        select_columns.append(func.avg(Transaction.area_sqft).label("avg_size"))
    if "total_sqft" in metrics:
        select_columns.append(func.sum(Transaction.area_sqft).label("total_sqft"))
    if "price_25th" in metrics:
        select_columns.append(func.percentile_cont(0.25).within_group(Transaction.price).label("price_25th"))
    if "price_75th" in metrics:
        select_columns.append(func.percentile_cont(0.75).within_group(Transaction.price).label("price_75th"))
    if "psf_25th" in metrics:
        select_columns.append(func.percentile_cont(0.25).within_group(Transaction.psf).label("psf_25th"))
    if "psf_75th" in metrics:
        select_columns.append(func.percentile_cont(0.75).within_group(Transaction.psf).label("psf_75th"))
    if "median_psf_actual" in metrics:
        # True median PSF using percentile_cont(0.5)
        select_columns.append(func.percentile_cont(0.5).within_group(Transaction.psf).label("median_psf_actual"))

    # Build the query
    if select_columns:
        query = db.session.query(*select_columns)
    else:
        query = db.session.query(func.count(Transaction.id).label("count"))

    # Apply filters
    if filter_conditions:
        query = query.filter(and_(*filter_conditions))

    # Apply group by
    if group_columns:
        query = query.group_by(*group_columns)
        # Order by first group column
        query = query.order_by(group_columns[0])

    # Execute query
    results = query.all()

    # Convert results to list of dicts
    data = []
    for row in results:
        row_dict = {}
        # Handle the row as a named tuple or similar
        if hasattr(row, '_asdict'):
            row_dict = row._asdict()
        else:
            # Fallback for older SQLAlchemy
            row_dict = dict(row._mapping) if hasattr(row, '_mapping') else {}

        # Post-process month/quarter formatting
        if "_year" in row_dict and "_month" in row_dict:
            year = int(row_dict.pop("_year")) if row_dict.get("_year") else None
            month = int(row_dict.pop("_month")) if row_dict.get("_month") else None
            if year and month:
                row_dict["month"] = f"{year}-{month:02d}"
        if "_year" in row_dict and "_quarter" in row_dict:
            year = int(row_dict.pop("_year")) if row_dict.get("_year") else None
            quarter = int(row_dict.pop("_quarter")) if row_dict.get("_quarter") else None
            if year and quarter:
                row_dict["quarter"] = f"{year}-Q{quarter}"

        # Clean up None values and convert types
        clean_dict = {}
        for key, value in row_dict.items():
            if value is None:
                clean_dict[key] = None
            elif isinstance(value, float):
                clean_dict[key] = round(value, 2)
            else:
                clean_dict[key] = value

        # Map avg to median if median was requested (approximation)
        if "median_psf" in metrics and "avg_psf" in clean_dict:
            clean_dict["median_psf"] = clean_dict.get("avg_psf")
        if "median_price" in metrics and "avg_price" in clean_dict:
            clean_dict["median_price"] = clean_dict.get("avg_price")

        data.append(clean_dict)

    elapsed = time.time() - start
    print(f"GET /api/aggregate took: {elapsed:.4f} seconds (returned {len(data)} groups from {total_records} records)")

    result = {
        "data": data,
        "meta": {
            "total_records": total_records,
            "filters_applied": filters_applied,
            "group_by": group_by,
            "metrics": metrics,
            "elapsed_ms": int(elapsed * 1000),
            "cache_hit": False,
            "note": "median values are approximated using avg for memory efficiency",
            "subscription": {
                "is_premium": is_premium,
                "time_restricted": False  # All data available, blur paywall instead of time restriction
            }
        }
    }

    # Cache the result for faster repeated queries
    _dashboard_cache.set(cache_key, result)

    return jsonify(result)


@analytics_bp.route("/transactions/list", methods=["GET"])
def transactions_list():
    """
    Paginated transaction list endpoint for drill-through, histogram analysis,
    and Value Parity Tool budget search.

    Query params:
      - Same filters as /aggregate
      - page: page number (default 1)
      - limit: records per page (default 50, max 10000 for histogram use cases)
      - sort_by: column to sort (default transaction_date)
      - sort_order: asc or desc (default desc)
      - price_min: minimum price filter (for budget search)
      - price_max: maximum price filter (for budget search)
      - lease_age: lease age range filter (0-5, 5-10, 10-20, 20+)

    Returns:
      {
        "transactions": [...],
        "pagination": {
          "page": N,
          "limit": N,
          "total_records": N,
          "total_pages": N
        }
      }
    """
    import time
    from datetime import datetime
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import desc, asc, func

    start = time.time()

    # Pagination params
    # No max limit - allow fetching all records for accurate histogram analysis
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 50))
    sort_by = request.args.get("sort_by", "transaction_date")
    sort_order = request.args.get("sort_order", "desc")

    # Build query with same filters as aggregate
    # Use active_query() to exclude outliers
    query = Transaction.active_query()

    # District filter
    districts_param = request.args.get("district")
    if districts_param:
        districts = [d.strip().upper() for d in districts_param.split(",") if d.strip()]
        normalized = []
        for d in districts:
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        query = query.filter(Transaction.district.in_(normalized))

    # Bedroom filter
    bedroom_param = request.args.get("bedroom")
    if bedroom_param:
        bedrooms = [int(b.strip()) for b in bedroom_param.split(",") if b.strip()]
        query = query.filter(Transaction.bedroom_count.in_(bedrooms))

    # Segment filter (supports comma-separated values e.g., "CCR,RCR")
    segment = request.args.get("segment")
    if segment:
        from services.data_processor import _get_market_segment
        segments = [s.strip().upper() for s in segment.split(',') if s.strip()]
        all_districts = db.session.query(Transaction.district).distinct().all()
        segment_districts = [
            d[0] for d in all_districts
            if _get_market_segment(d[0]) in segments
        ]
        query = query.filter(Transaction.district.in_(segment_districts))

    # Sale type filter (case-insensitive)
    sale_type = request.args.get("sale_type")
    if sale_type:
        query = query.filter(func.lower(Transaction.sale_type) == sale_type.lower())

    # Date range filter
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    if date_from:
        try:
            from_dt = datetime.strptime(date_from, "%Y-%m-%d").date()
            query = query.filter(Transaction.transaction_date >= from_dt)
        except ValueError:
            pass
    if date_to:
        try:
            to_dt = datetime.strptime(date_to, "%Y-%m-%d").date()
            query = query.filter(Transaction.transaction_date <= to_dt)
        except ValueError:
            pass

    # PSF range filter
    psf_min = request.args.get("psf_min")
    psf_max = request.args.get("psf_max")
    if psf_min:
        query = query.filter(Transaction.psf >= float(psf_min))
    if psf_max:
        query = query.filter(Transaction.psf <= float(psf_max))

    # Size range filter
    size_min = request.args.get("size_min")
    size_max = request.args.get("size_max")
    if size_min:
        query = query.filter(Transaction.area_sqft >= float(size_min))
    if size_max:
        query = query.filter(Transaction.area_sqft <= float(size_max))

    # Price range filter (for Value Parity Tool budget filter)
    price_min = request.args.get("price_min")
    price_max = request.args.get("price_max")
    if price_min:
        query = query.filter(Transaction.price >= float(price_min))
    if price_max:
        query = query.filter(Transaction.price <= float(price_max))

    # Lease age filter (years since lease started)
    lease_age = request.args.get("lease_age")
    if lease_age:
        from datetime import datetime
        current_year = datetime.now().year
        if lease_age == "0-5":
            # Lease started within last 5 years
            query = query.filter(Transaction.lease_start_year >= current_year - 5)
        elif lease_age == "4-9":
            # Young Resale: 4-9 years old
            query = query.filter(Transaction.lease_start_year >= current_year - 9)
            query = query.filter(Transaction.lease_start_year <= current_year - 4)
        elif lease_age == "5-10":
            query = query.filter(Transaction.lease_start_year >= current_year - 10)
            query = query.filter(Transaction.lease_start_year < current_year - 5)
        elif lease_age == "10-20":
            query = query.filter(Transaction.lease_start_year >= current_year - 20)
            query = query.filter(Transaction.lease_start_year < current_year - 10)
        elif lease_age == "20+":
            query = query.filter(Transaction.lease_start_year < current_year - 20)

    # Tenure filter
    tenure = request.args.get("tenure")
    if tenure:
        from sqlalchemy import or_, and_
        tenure_lower = tenure.lower()
        if tenure_lower == "freehold":
            query = query.filter(or_(
                Transaction.tenure.ilike("%freehold%"),
                Transaction.remaining_lease == 999
            ))
        elif tenure_lower in ["99-year", "99"]:
            query = query.filter(and_(
                Transaction.remaining_lease < 999,
                Transaction.remaining_lease > 0
            ))

    # Project filter - supports both partial match (search) and exact match (drill-through)
    project_exact = request.args.get("project_exact")
    project = request.args.get("project")
    if project_exact:
        # EXACT match - for ProjectDetailPanel drill-through
        query = query.filter(Transaction.project_name == project_exact)
    elif project:
        # PARTIAL match - for search functionality
        query = query.filter(Transaction.project_name.ilike(f"%{project}%"))

    # Get total count before pagination
    total_records = query.count()
    total_pages = (total_records + limit - 1) // limit

    # SECURITY: K-anonymity check for free users
    # Prevents re-identification by requiring minimum result count
    from utils.subscription import check_k_anonymity, is_premium_user
    passes_k_check, k_error = check_k_anonymity(total_records)
    if not passes_k_check:
        return jsonify({
            "transactions": [],
            "pagination": {
                "page": 1,
                "limit": limit,
                "total_records": 0,
                "total_pages": 0
            },
            "warning": k_error,
            "_restricted": True
        })

    # Apply sorting
    sort_col = getattr(Transaction, sort_by, Transaction.transaction_date)
    if sort_order == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))

    # Apply pagination
    offset = (page - 1) * limit
    transactions = query.offset(offset).limit(limit).all()

    elapsed = time.time() - start
    print(f"GET /api/transactions/list took: {elapsed:.4f} seconds (page {page}, {len(transactions)} records)")

    # SECURITY: Use tier-aware serialization
    # Premium users get full data, free/anonymous users get masked teaser data
    from utils.subscription import serialize_transactions
    serialized = serialize_transactions(transactions)

    return jsonify({
        "transactions": serialized,
        "pagination": {
            "page": page,
            "limit": limit,
            "total_records": total_records,
            "total_pages": total_pages
        }
    })


@analytics_bp.route("/filter-options", methods=["GET"])
def filter_options():
    """
    Get available filter options based on current data.
    Returns unique values for each filterable dimension.
    """
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, distinct
    from services.data_processor import _get_market_segment

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

        return jsonify({
            "districts": districts,
            "regions": regions,
            "bedrooms": bedrooms,
            "sale_types": sale_types,
            "projects": projects[:100],  # Limit project list
            "date_range": {
                "min": min_date.isoformat() if min_date else None,
                "max": max_date.isoformat() if max_date else None
            },
            "psf_range": {
                "min": psf_stats[0] if psf_stats else None,
                "max": psf_stats[1] if psf_stats else None
            },
            "size_range": {
                "min": size_stats[0] if size_stats else None,
                "max": size_stats[1] if size_stats else None
            },
            "tenures": tenures
        })
    except Exception as e:
        print(f"GET /api/filter-options ERROR: {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/psf_trends_by_region", methods=["GET"])
def psf_trends_by_region():
    """
    Get median PSF trends by region (CCR, RCR, OCR) over time by quarter.

    Query params:
      - bedroom: comma-separated bedroom counts, e.g. 2,3,4 (default: 2,3,4)
      - district: comma-separated districts to filter (optional, but ignored for region analysis)
    """
    start = time.time()

    # Parse bedroom parameter
    bedroom_param = request.args.get("bedroom", "2,3,4")
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400

    # Note: districts parameter is accepted but ignored for region analysis
    # (region analysis needs all districts to calculate CCR/RCR/OCR)

    try:
        # Use data_processor function which supports bedroom filtering
        from services.data_processor import get_psf_trends_by_region

        trends = get_psf_trends_by_region(bedroom_types=bedroom_types, districts=None)

        elapsed = time.time() - start
        print(f"GET /api/psf_trends_by_region took: {elapsed:.4f} seconds (bedrooms: {bedroom_types})")
        return jsonify(trends)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/psf_trends_by_region ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/new-vs-resale", methods=["GET"])
def new_vs_resale():
    """
    New Sale vs Young Resale (4-9 years age) comparison.

    Young Resale definition:
    - Property age (transaction year - lease start year) between 4 and 9 years
    - Project must have at least one resale transaction (excludes delayed construction)

    RESPECTS GLOBAL FILTERS from sidebar (district, bedroom, segment, date range).
    Only the drill level (timeGrain) is visual-local.

    Query params (global filters from sidebar):
      - district: comma-separated districts (D01,D02,...) - from global sidebar
      - bedroom: comma-separated bedroom counts (2,3,4) - from global sidebar
      - segment: CCR, RCR, OCR - from global sidebar
      - date_from: YYYY-MM-DD - from global sidebar
      - date_to: YYYY-MM-DD - from global sidebar

    Query params (visual-local):
      - timeGrain: year, quarter, month (default: quarter) - for drill up/down

    Returns:
      {
        "chartData": [...],
        "summary": {...},
        "appliedFilters": {...}
      }
    """
    start = time.time()

    # Parse GLOBAL filter parameters (from sidebar)
    districts_param = request.args.get("district")
    districts = None
    if districts_param:
        districts = [d.strip().upper() for d in districts_param.split(",") if d.strip()]
        # Normalize districts
        normalized = []
        for d in districts:
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        districts = normalized

    bedroom_param = request.args.get("bedroom")
    bedrooms = None
    if bedroom_param:
        try:
            bedrooms = [int(b.strip()) for b in bedroom_param.split(",") if b.strip()]
        except ValueError:
            bedrooms = None

    segment = request.args.get("segment")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    # Parse visual-local parameter (drill level)
    time_grain = request.args.get("timeGrain", "quarter")
    valid_time_grains = ["year", "quarter", "month"]
    if time_grain not in valid_time_grains:
        return jsonify({"error": f"Invalid timeGrain. Must be one of: {valid_time_grains}"}), 400

    try:
        from services.data_processor import get_new_vs_resale_comparison

        result = get_new_vs_resale_comparison(
            districts=districts,
            bedrooms=bedrooms,
            segment=segment,
            date_from=date_from,
            date_to=date_to,
            time_grain=time_grain
        )

        elapsed = time.time() - start
        filter_info = f"districts={districts}, bedrooms={bedrooms}, segment={segment}, timeGrain={time_grain}"
        print(f"GET /api/new-vs-resale took: {elapsed:.4f} seconds ({filter_info})")
        return jsonify(result)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/new-vs-resale ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500



# ============================================================================
# FLOOR LIQUIDITY HEATMAP ENDPOINT
# ============================================================================

@analytics_bp.route("/floor-liquidity-heatmap", methods=["GET"])
def floor_liquidity_heatmap():
    """
    Floor liquidity heatmap data - shows which floor zones resell faster by project.

    Uses Z-score normalization within each project for fair comparison.

    Query params:
      - window_months: 6 | 12 | 24 (default: 12) - Rolling window for velocity
      - segment: CCR | RCR | OCR (optional)
      - district: comma-separated districts
      - bedroom: comma-separated bedroom counts
      - min_transactions: minimum per project (default: 10)
      - limit: max projects to return (default: 30, max: 50)
      - skip_cache: if 'true', bypass cache

    Returns:
      {
        "data": {
          "projects": [
            {
              "project_name": "...",
              "district": "D01",
              "total_transactions": 156,
              "floor_zones": {
                "Low": { "count": 23, "velocity": 0.32, "z_score": -0.42, "liquidity_label": "Neutral" }
              }
            }
          ],
          "floor_zone_order": ["Low", "Mid-Low", "Mid", "Mid-High", "High", "Luxury"]
        },
        "meta": {...}
      }
    """
    import time
    import statistics
    from datetime import datetime, timedelta
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, and_
    from services.data_processor import _get_market_segment
    from services.dashboard_service import _dashboard_cache
    from services.new_launch_units import get_units_for_project

    start = time.time()

    # Parse parameters
    window_months = int(request.args.get('window_months', 12))
    if window_months not in [6, 12, 24]:
        window_months = 12

    # Exclusion thresholds for reliable liquidity analysis
    min_transactions = int(request.args.get('min_transactions', 30))  # Exclude projects with <30 resale txns
    min_units = int(request.args.get('min_units', 100))  # Exclude boutique projects with <100 units
    limit = int(request.args.get('limit', 0))  # 0 = no limit (show all projects)
    skip_cache = request.args.get('skip_cache', '').lower() == 'true'

    # Build cache key
    cache_key = f"floor_liquidity_heatmap:{request.query_string.decode('utf-8')}"

    if not skip_cache:
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            elapsed = time.time() - start
            cached['meta']['cache_hit'] = True
            cached['meta']['elapsed_ms'] = int(elapsed * 1000)
            return jsonify(cached)

    # Build filter conditions
    filter_conditions = [
        Transaction.is_outlier == False,
        func.lower(Transaction.sale_type) == 'resale',
        Transaction.floor_level.isnot(None),
        Transaction.floor_level != 'Unknown'
    ]
    filters_applied = {'sale_type': 'Resale', 'window_months': window_months}

    # Date filter based on window
    cutoff_date = datetime.now().date() - timedelta(days=window_months * 30)
    filter_conditions.append(Transaction.transaction_date >= cutoff_date)
    filters_applied['date_from'] = cutoff_date.isoformat()

    # Segment filter
    segment = request.args.get('segment')
    if segment:
        segments = [s.strip().upper() for s in segment.split(',') if s.strip()]
        all_districts = db.session.query(Transaction.district).distinct().all()
        segment_districts = [d[0] for d in all_districts if _get_market_segment(d[0]) in segments]
        filter_conditions.append(Transaction.district.in_(segment_districts))
        filters_applied['segment'] = segments

    # District filter
    districts_param = request.args.get('district')
    if districts_param:
        districts = [d.strip().upper() for d in districts_param.split(',') if d.strip()]
        normalized = [f"D{d.zfill(2)}" if not d.startswith('D') else d for d in districts]
        filter_conditions.append(Transaction.district.in_(normalized))
        filters_applied['district'] = normalized

    # Bedroom filter
    bedroom_param = request.args.get('bedroom')
    if bedroom_param:
        bedrooms = [int(b.strip()) for b in bedroom_param.split(',') if b.strip()]
        filter_conditions.append(Transaction.bedroom_count.in_(bedrooms))
        filters_applied['bedroom'] = bedrooms

    try:
        # Query: Group by project and floor_level
        raw_data = db.session.query(
            Transaction.project_name,
            Transaction.district,
            Transaction.floor_level,
            func.count(Transaction.id).label('count')
        ).filter(
            and_(*filter_conditions)
        ).group_by(
            Transaction.project_name,
            Transaction.district,
            Transaction.floor_level
        ).all()

        # Organize by project
        projects_dict = {}
        for row in raw_data:
            proj = row.project_name
            if proj not in projects_dict:
                projects_dict[proj] = {
                    'project_name': proj,
                    'district': row.district,
                    'floor_zones': {},
                    'total_transactions': 0
                }

            velocity = row.count / window_months
            projects_dict[proj]['floor_zones'][row.floor_level] = {
                'count': row.count,
                'velocity': round(velocity, 3)
            }
            projects_dict[proj]['total_transactions'] += row.count

        # Filter by minimum transactions and minimum units
        # Track exclusions for transparency
        excluded_low_txns = 0
        excluded_boutique = 0
        projects = []

        for p in projects_dict.values():
            # Check minimum transactions
            if p['total_transactions'] < min_transactions:
                excluded_low_txns += 1
                continue

            # Check minimum units (exclude boutique projects)
            project_info = get_units_for_project(p['project_name'], check_resale=False)
            total_units = project_info.get('total_units')
            p['total_units'] = total_units  # Store for reference

            if total_units is not None and total_units < min_units:
                excluded_boutique += 1
                continue

            projects.append(p)

        # Calculate Z-scores within each project
        for project in projects:
            zones = project['floor_zones']
            velocities = [z['velocity'] for z in zones.values()]

            if len(velocities) < 2:
                # Cannot compute Z-score with fewer than 2 zones
                for zone in zones.values():
                    zone['z_score'] = 0.0
                    zone['liquidity_label'] = 'Neutral'
            else:
                mean_vel = statistics.mean(velocities)
                try:
                    std_vel = statistics.stdev(velocities)
                except:
                    std_vel = 0

                for zone in zones.values():
                    if std_vel > 0:
                        z = (zone['velocity'] - mean_vel) / std_vel
                    else:
                        z = 0.0
                    zone['z_score'] = round(z, 2)

                    # Label based on Z-score
                    if z >= 0.75:
                        zone['liquidity_label'] = 'Very Liquid'
                    elif z >= 0.25:
                        zone['liquidity_label'] = 'Liquid'
                    elif z >= -0.25:
                        zone['liquidity_label'] = 'Neutral'
                    elif z >= -0.75:
                        zone['liquidity_label'] = 'Illiquid'
                    else:
                        zone['liquidity_label'] = 'Very Illiquid'

        # Sort alphabetically by project name and optionally limit
        projects.sort(key=lambda x: x['project_name'])
        total_projects = len(projects)
        if limit > 0:
            projects = projects[:limit]

        # Build response
        result = {
            'data': {
                'projects': projects,
                'floor_zone_order': ['Low', 'Mid-Low', 'Mid', 'Mid-High', 'High', 'Luxury']
            },
            'meta': {
                'window_months': window_months,
                'filters_applied': filters_applied,
                'total_projects': total_projects,
                'projects_returned': len(projects),
                'exclusions': {
                    'low_transactions': excluded_low_txns,
                    'boutique_projects': excluded_boutique,
                    'min_transactions_threshold': min_transactions,
                    'min_units_threshold': min_units
                },
                'cache_hit': False,
                'elapsed_ms': 0
            }
        }

        # Cache the result
        _dashboard_cache.set(cache_key, result)

        elapsed = time.time() - start
        result['meta']['elapsed_ms'] = int(elapsed * 1000)
        print(f"GET /api/floor-liquidity-heatmap took: {elapsed:.4f}s ({len(projects)} projects)")

        return jsonify(result)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/floor-liquidity-heatmap ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ============================================================================
# PROJECT INVENTORY ENDPOINTS
# ============================================================================

@analytics_bp.route("/projects/<path:project_name>/inventory", methods=["GET"])
def get_project_inventory(project_name):
    """
    Get inventory data for a specific project.

    Uses CSV file (rawdata/new_launch_units.csv) for total_units lookup.
    Calculates unsold from total_units - count(New Sale transactions).

    Returns:
        - total_units: Total units in the development
        - cumulative_new_sales: Units sold by developer (from transactions)
        - estimated_unsold: total_units - cumulative_new_sales
    """
    start = time.time()
    from models.transaction import Transaction
    from models.database import db
    from services.new_launch_units import get_units_for_project
    from sqlalchemy import func

    try:
        # Lookup total_units from CSV
        lookup = get_units_for_project(project_name)
        total_units = lookup.get("total_units")

        # Count sales from transactions
        new_sale_count = db.session.query(func.count(Transaction.id)).filter(
            Transaction.project_name == project_name,
            Transaction.sale_type == 'New Sale',
            Transaction.is_outlier == False
        ).scalar() or 0

        resale_count = db.session.query(func.count(Transaction.id)).filter(
            Transaction.project_name == project_name,
            Transaction.sale_type == 'Resale',
            Transaction.is_outlier == False
        ).scalar() or 0

        # Build response
        result = {
            "project_name": project_name,
            "cumulative_new_sales": new_sale_count,
            "cumulative_resales": resale_count,
            "total_transactions": new_sale_count + resale_count,
        }

        if total_units:
            percent_sold = round((new_sale_count / total_units) * 100, 1) if total_units > 0 else 0
            result.update({
                "total_units": total_units,
                "estimated_unsold": max(0, total_units - new_sale_count),
                "percent_sold": percent_sold,
                "data_source": lookup.get("source", "CSV"),
            })
        else:
            result.update({
                "total_units": None,
                "estimated_unsold": None,
                "message": "Total units not available. Add to rawdata/new_launch_units.csv"
            })

        elapsed = time.time() - start
        print(f"GET /api/projects/{project_name}/inventory took: {elapsed:.4f}s")

        return jsonify(result)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/projects/{project_name}/inventory ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/scatter-sample", methods=["GET"])
def scatter_sample():
    """
    Get a stable, stratified sample of transactions for scatter plot visualization.

    Returns sampled points for Unit Size vs Price chart (memory-safe).

    Sampling Methodology:
    =====================
    1. STRATIFIED by market segment (CCR/RCR/OCR): Ensures all 3 segments are
       represented equally, preventing high-volume OCR from drowning out CCR.
       Each segment gets up to (sample_size / 3) points (~667 each for n=2000).

    2. STABLE hash-based selection: Uses md5(id) for deterministic sampling.
       Same filters always return the same data points (no "flickering").

    3. REFRESH capability: Optional seed parameter generates different samples
       while maintaining stratification.

    Why 2,000 samples?
    ==================
    - Statistical confidence: For a population of ~100K transactions, n=2000 gives
      margin of error ~2.2% at 95% confidence (formula: 1.96 * sqrt(0.5*0.5/n))
    - Visual clarity: More points cause overplotting; 2000 balances coverage vs clarity
    - Performance: Keeps response time <200ms and payload <100KB
    - Per-segment: ~667 points per segment (2000/3) ensures CCR visible alongside OCR

    Query params:
      Filters (same as other endpoints):
        - date_from, date_to: date range
        - district: comma-separated districts
        - bedroom: comma-separated bedroom counts
        - segment: CCR, RCR, OCR
        - sale_type: 'New Sale' or 'Resale'
        - psf_min, psf_max: PSF range
        - size_min, size_max: sqft range

      Options:
        - sample_size: max points to return (default: 2000, max: 5000)
        - seed: random string to generate different sample (used by refresh)

    Returns:
      {
        "data": [
          {"price": 1500000, "area_sqft": 850, "bedroom": 2, "district": "D15"},
          ...
        ],
        "meta": {
          "sample_size": 2000,
          "total_count": 45000,
          "samples_per_segment": 667,
          "sampling_method": "stratified_by_segment",
          "elapsed_ms": 123.4
        }
      }
    """
    start = time.time()

    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, or_, text
    from constants import CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS

    try:
        # Parse sample size
        sample_size = min(int(request.args.get('sample_size', 2000)), 5000)

        # Parse optional seed for refresh functionality
        # - No seed: stable hash (same filters = same sample)
        # - With seed: different sample (used by refresh button)
        seed = request.args.get('seed', '')

        # Build base query with outlier exclusion
        query = db.session.query(
            Transaction.id,  # Need ID for stable hashing
            Transaction.price,
            Transaction.area_sqft,
            Transaction.bedroom_count,
            Transaction.district
        ).filter(
            or_(Transaction.is_outlier == False, Transaction.is_outlier.is_(None))
        )

        # Apply filters
        # Date range
        if request.args.get('date_from'):
            query = query.filter(Transaction.transaction_date >= request.args.get('date_from'))
        if request.args.get('date_to'):
            query = query.filter(Transaction.transaction_date <= request.args.get('date_to'))

        # District filter
        if request.args.get('district'):
            districts = [d.strip() for d in request.args.get('district').split(',') if d.strip()]
            if districts:
                query = query.filter(Transaction.district.in_(districts))

        # Segment filter (CCR/RCR/OCR)
        if request.args.get('segment'):
            segment = request.args.get('segment').upper()
            if segment == 'CCR':
                query = query.filter(Transaction.district.in_(CCR_DISTRICTS))
            elif segment == 'RCR':
                query = query.filter(Transaction.district.in_(RCR_DISTRICTS))
            elif segment == 'OCR':
                query = query.filter(Transaction.district.in_(OCR_DISTRICTS))

        # Bedroom filter
        if request.args.get('bedroom'):
            bedrooms = [int(b.strip()) for b in request.args.get('bedroom').split(',') if b.strip()]
            if bedrooms:
                query = query.filter(Transaction.bedroom_count.in_(bedrooms))

        # Sale type filter
        if request.args.get('sale_type'):
            query = query.filter(Transaction.sale_type == request.args.get('sale_type'))

        # PSF range
        if request.args.get('psf_min'):
            query = query.filter(Transaction.psf >= float(request.args.get('psf_min')))
        if request.args.get('psf_max'):
            query = query.filter(Transaction.psf <= float(request.args.get('psf_max')))

        # Size range
        if request.args.get('size_min'):
            query = query.filter(Transaction.area_sqft >= float(request.args.get('size_min')))
        if request.args.get('size_max'):
            query = query.filter(Transaction.area_sqft <= float(request.args.get('size_max')))

        # Get total count first (for meta)
        total_count = query.count()

        # Calculate samples per segment (CCR/RCR/OCR = 3 segments)
        # Use ceiling division to ensure we reach sample_size (e.g., 2000/3 = 667, 667*3 = 2001, capped by LIMIT)
        import math
        samples_per_segment = max(1, math.ceil(sample_size / 3))

        # Build WHERE clause conditions from filters
        where_conditions = ["(is_outlier = false OR is_outlier IS NULL)"]
        params = {"samples_per_segment": samples_per_segment, "sample_size": sample_size}

        if request.args.get('date_from'):
            where_conditions.append("transaction_date >= :date_from")
            params["date_from"] = request.args.get('date_from')
        if request.args.get('date_to'):
            where_conditions.append("transaction_date <= :date_to")
            params["date_to"] = request.args.get('date_to')
        if request.args.get('district'):
            districts = [d.strip() for d in request.args.get('district').split(',') if d.strip()]
            if districts:
                district_placeholders = ", ".join([f":district_{i}" for i in range(len(districts))])
                where_conditions.append(f"district IN ({district_placeholders})")
                for i, d in enumerate(districts):
                    params[f"district_{i}"] = d
        if request.args.get('segment'):
            segment = request.args.get('segment').upper()
            if segment == 'CCR':
                where_conditions.append("district IN :ccr_districts")
                params["ccr_districts"] = tuple(CCR_DISTRICTS)
            elif segment == 'RCR':
                where_conditions.append("district IN :rcr_districts")
                params["rcr_districts"] = tuple(RCR_DISTRICTS)
            elif segment == 'OCR':
                where_conditions.append("district IN :ocr_districts")
                params["ocr_districts"] = tuple(OCR_DISTRICTS)
        if request.args.get('bedroom'):
            bedrooms = [int(b.strip()) for b in request.args.get('bedroom').split(',') if b.strip()]
            if bedrooms:
                bedroom_placeholders = ", ".join([f":bedroom_{i}" for i in range(len(bedrooms))])
                where_conditions.append(f"bedroom_count IN ({bedroom_placeholders})")
                for i, b in enumerate(bedrooms):
                    params[f"bedroom_{i}"] = b
        if request.args.get('sale_type'):
            where_conditions.append("sale_type = :sale_type")
            params["sale_type"] = request.args.get('sale_type')
        if request.args.get('psf_min'):
            where_conditions.append("psf >= :psf_min")
            params["psf_min"] = float(request.args.get('psf_min'))
        if request.args.get('psf_max'):
            where_conditions.append("psf <= :psf_max")
            params["psf_max"] = float(request.args.get('psf_max'))
        if request.args.get('size_min'):
            where_conditions.append("area_sqft >= :size_min")
            params["size_min"] = float(request.args.get('size_min'))
        if request.args.get('size_max'):
            where_conditions.append("area_sqft <= :size_max")
            params["size_max"] = float(request.args.get('size_max'))

        where_clause = " AND ".join(where_conditions)

        # Build segment district lists for SQL
        ccr_list = ",".join([f"'{d}'" for d in CCR_DISTRICTS])
        rcr_list = ",".join([f"'{d}'" for d in RCR_DISTRICTS])
        ocr_list = ",".join([f"'{d}'" for d in OCR_DISTRICTS])

        # Fast sampling using random() with LIMIT
        # For refresh (with seed): pure random, very fast
        # For stable (no seed): use md5(id) for deterministic results
        if seed:
            # Fast random sampling - no sorting needed, just pick random rows
            sql = text(f"""
                (SELECT price, area_sqft, bedroom_count, district
                 FROM transactions TABLESAMPLE BERNOULLI(10)
                 WHERE {where_clause} AND district IN ({ccr_list})
                 LIMIT :samples_per_segment)
                UNION ALL
                (SELECT price, area_sqft, bedroom_count, district
                 FROM transactions TABLESAMPLE BERNOULLI(10)
                 WHERE {where_clause} AND district IN ({rcr_list})
                 LIMIT :samples_per_segment)
                UNION ALL
                (SELECT price, area_sqft, bedroom_count, district
                 FROM transactions TABLESAMPLE BERNOULLI(10)
                 WHERE {where_clause} AND district IN ({ocr_list})
                 LIMIT :samples_per_segment)
            """)
        else:
            # Stable sampling using md5(id) - slower but deterministic
            sql = text(f"""
                (SELECT price, area_sqft, bedroom_count, district
                 FROM transactions
                 WHERE {where_clause} AND district IN ({ccr_list})
                 ORDER BY md5(id::TEXT)
                 LIMIT :samples_per_segment)
                UNION ALL
                (SELECT price, area_sqft, bedroom_count, district
                 FROM transactions
                 WHERE {where_clause} AND district IN ({rcr_list})
                 ORDER BY md5(id::TEXT)
                 LIMIT :samples_per_segment)
                UNION ALL
                (SELECT price, area_sqft, bedroom_count, district
                 FROM transactions
                 WHERE {where_clause} AND district IN ({ocr_list})
                 ORDER BY md5(id::TEXT)
                 LIMIT :samples_per_segment)
            """)

        result = db.session.execute(sql, params)
        sampled = result.fetchall()

        # SECURITY: Check subscription tier for scatter data precision
        # Premium: exact values | Free: rounded values (preserves pattern, reduces precision)
        from utils.subscription import is_premium_user
        is_premium = is_premium_user()

        # Format response with tier-aware precision
        if is_premium:
            data = [
                {
                    "price": row.price,
                    "area_sqft": row.area_sqft,
                    "bedroom": row.bedroom_count,
                    "district": row.district
                }
                for row in sampled
            ]
        else:
            # Free users: round price to nearest $50K, area to nearest 25 sqft
            # Preserves market pattern visualization without revealing exact values
            data = [
                {
                    "price": round(row.price / 50000) * 50000 if row.price else None,
                    "area_sqft": round(row.area_sqft / 25) * 25 if row.area_sqft else None,
                    "bedroom": row.bedroom_count,
                    "district": row.district
                }
                for row in sampled
            ]

        elapsed = time.time() - start
        print(f"GET /api/scatter-sample returned {len(data)} points (stratified by segment) in {elapsed:.4f}s")

        return jsonify({
            "data": data,
            "meta": {
                "sample_size": len(data),
                "total_count": total_count,
                "samples_per_segment": samples_per_segment,
                "sampling_method": "stratified_by_segment",
                "elapsed_ms": round(elapsed * 1000, 2)
            }
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/scatter-sample ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ============================================================================
# KPI SUMMARY ENDPOINT (OPTIMIZED SINGLE-CALL)
# ============================================================================

@analytics_bp.route("/kpi-summary", methods=["GET"])
def kpi_summary():
    """
    Single optimized endpoint for KPI cards - returns all metrics in one call.

    Uses a single SQL query with CTEs for maximum performance.

    Query params:
      - district: comma-separated districts
      - bedroom: comma-separated bedroom counts
      - segment: CCR, RCR, OCR

    Returns:
      {
        "medianPsf": { "current": 1842, "previous": 1798, "trend": 2.4 },
        "priceSpread": { "iqr": 485, "iqrRatio": 26.3, "label": "Stable" },
        "newLaunchPremium": { "value": 18.5, "trend": "widening" },
        "marketMomentum": { "score": 38, "label": "Seller's market" },
        "insights": {
          "psf": "Rising - sellers have leverage",
          "spread": "Normal variance",
          "premium": "High premium - consider resale",
          "momentum": "Good time to sell"
        }
      }
    """
    import time
    from datetime import datetime, timedelta
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, text

    start = time.time()

    try:
        # Get max date from metadata
        max_date_result = db.session.execute(text("""
            SELECT MAX(transaction_date) as max_date FROM transactions WHERE is_outlier = false
        """)).fetchone()

        if not max_date_result or not max_date_result.max_date:
            return jsonify({"error": "No data available"}), 404

        max_date = max_date_result.max_date
        thirty_days_ago = max_date - timedelta(days=30)
        sixty_days_ago = max_date - timedelta(days=60)

        # Build filter conditions
        filter_sql = "is_outlier = false"
        params = {
            'max_date': max_date,
            'thirty_days_ago': thirty_days_ago,
            'sixty_days_ago': sixty_days_ago
        }

        # District filter
        district_param = request.args.get('district')
        if district_param:
            districts = [d.strip().upper() for d in district_param.split(',') if d.strip()]
            normalized = []
            for d in districts:
                if not d.startswith('D'):
                    d = f'D{d.zfill(2)}'
                normalized.append(d)
            filter_sql += f" AND district IN :districts"
            params['districts'] = tuple(normalized)

        # Bedroom filter
        bedroom_param = request.args.get('bedroom')
        if bedroom_param:
            bedrooms = [int(b.strip()) for b in bedroom_param.split(',') if b.strip().isdigit()]
            filter_sql += f" AND num_bedrooms IN :bedrooms"
            params['bedrooms'] = tuple(bedrooms)

        # Segment filter
        segment_param = request.args.get('segment')
        if segment_param:
            from constants import get_districts_for_region
            segment = segment_param.upper()
            if segment in ['CCR', 'RCR', 'OCR']:
                segment_districts = get_districts_for_region(segment)
                filter_sql += f" AND district IN :segment_districts"
                params['segment_districts'] = tuple(segment_districts)

        # Single optimized query using CTEs
        sql = text(f"""
            WITH current_period AS (
                SELECT
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY psf) as psf_25,
                    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY psf) as psf_75,
                    COUNT(*) as txn_count
                FROM transactions
                WHERE {filter_sql}
                  AND transaction_date >= :thirty_days_ago
                  AND transaction_date <= :max_date
            ),
            previous_period AS (
                SELECT
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                    COUNT(*) as txn_count
                FROM transactions
                WHERE {filter_sql}
                  AND transaction_date >= :sixty_days_ago
                  AND transaction_date < :thirty_days_ago
            ),
            new_sales AS (
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
                FROM transactions
                WHERE {filter_sql}
                  AND sale_type = 'New Sale'
                  AND transaction_date > :max_date - INTERVAL '12 months'
            ),
            young_resales AS (
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
                FROM transactions
                WHERE {filter_sql}
                  AND sale_type = 'Resale'
                  AND transaction_date > :max_date - INTERVAL '12 months'
                  AND EXTRACT(YEAR FROM transaction_date) - COALESCE(lease_start_year, EXTRACT(YEAR FROM transaction_date) - 5) BETWEEN 4 AND 9
            )
            SELECT
                c.median_psf as current_psf,
                c.psf_25,
                c.psf_75,
                c.txn_count,
                p.median_psf as prev_psf,
                p.txn_count as prev_txn_count,
                n.median_psf as new_sale_psf,
                r.median_psf as resale_psf
            FROM current_period c
            CROSS JOIN previous_period p
            CROSS JOIN new_sales n
            CROSS JOIN young_resales r
        """)

        result = db.session.execute(sql, params).fetchone()

        if not result or not result.current_psf:
            # Return defaults if no data
            elapsed = time.time() - start
            return jsonify({
                "medianPsf": {"current": 0, "previous": 0, "trend": 0},
                "priceSpread": {"iqr": 0, "iqrRatio": 0, "label": "No data"},
                "newLaunchPremium": {"value": 0, "trend": "stable"},
                "marketMomentum": {"score": 50, "label": "No data"},
                "insights": {
                    "psf": "Insufficient data",
                    "spread": "Insufficient data",
                    "premium": "Insufficient data",
                    "momentum": "Insufficient data"
                },
                "meta": {"elapsed_ms": round(elapsed * 1000, 2), "txn_count": 0}
            })

        # Calculate metrics
        current_psf = float(result.current_psf or 0)
        prev_psf = float(result.prev_psf or current_psf)
        psf_25 = float(result.psf_25 or 0)
        psf_75 = float(result.psf_75 or 0)
        new_sale_psf = float(result.new_sale_psf or 0)
        resale_psf = float(result.resale_psf or 0)
        txn_count = int(result.txn_count or 0)
        prev_txn_count = int(result.prev_txn_count or 0)

        # PSF trend (only calculate if we have previous data)
        if prev_txn_count > 0 and prev_psf > 0:
            psf_trend = ((current_psf - prev_psf) / prev_psf * 100)
        else:
            psf_trend = None  # No data to compare

        # Price spread (IQR)
        iqr = psf_75 - psf_25
        iqr_ratio = (iqr / current_psf * 100) if current_psf > 0 else 0
        iqr_ratio = min(iqr_ratio, 100)  # Cap at 100%

        spread_label = "Very Stable" if iqr_ratio < 20 else "Stable" if iqr_ratio < 30 else "Moderate" if iqr_ratio < 40 else "Volatile"

        # New launch premium
        new_premium = ((new_sale_psf - resale_psf) / resale_psf * 100) if resale_psf > 0 else 0
        premium_trend = "widening" if new_premium > 15 else "narrowing" if new_premium < 10 else "stable"

        # Market momentum (based on PSF trend, default to 50 if no trend data)
        if psf_trend is not None:
            momentum_score = 50 - (psf_trend * 5)
            momentum_score = max(20, min(80, momentum_score))
        else:
            momentum_score = 50  # Neutral when no data
        momentum_label = "Buyer's market" if momentum_score >= 55 else "Seller's market" if momentum_score <= 45 else "Balanced"

        # Generate compact insights - just the numbers, no filler words
        # PSF: show previous vs current (handle no data case)
        if prev_txn_count > 0:
            psf_insight = f"Prev ${round(prev_psf):,} → Now ${round(current_psf):,}"
        else:
            psf_insight = f"Now ${round(current_psf):,} (no prev data)"

        # Spread: show percentiles
        spread_insight = f"P25 ${round(psf_25):,} · P75 ${round(psf_75):,}"

        # Premium: show new vs resale PSF
        if new_sale_psf > 0 and resale_psf > 0:
            premium_insight = f"New ${round(new_sale_psf):,} vs Resale ${round(resale_psf):,}"
        else:
            premium_insight = "Insufficient data"

        # Momentum: show the trend driving it
        if psf_trend is not None:
            momentum_insight = f"Trend {psf_trend:+.1f}% MoM"
        else:
            momentum_insight = "No trend data"

        elapsed = time.time() - start
        print(f"GET /api/kpi-summary completed in {elapsed:.4f}s")

        return jsonify({
            "medianPsf": {
                "current": round(current_psf),
                "previous": round(prev_psf) if prev_txn_count > 0 else None,
                "trend": round(psf_trend, 1) if psf_trend is not None else None
            },
            "priceSpread": {
                "iqr": round(iqr),
                "iqrRatio": round(iqr_ratio, 1),
                "label": spread_label
            },
            "newLaunchPremium": {
                "value": round(new_premium, 1),
                "trend": premium_trend
            },
            "marketMomentum": {
                "score": round(momentum_score),
                "label": momentum_label
            },
            "insights": {
                "psf": psf_insight,
                "spread": spread_insight,
                "premium": premium_insight,
                "momentum": momentum_insight
            },
            "meta": {
                "elapsed_ms": round(elapsed * 1000, 2),
                "current_period": {
                    "from": str(thirty_days_ago),
                    "to": str(max_date),
                    "txn_count": txn_count
                },
                "previous_period": {
                    "from": str(sixty_days_ago),
                    "to": str(thirty_days_ago),
                    "txn_count": prev_txn_count
                }
            }
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/kpi-summary ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ============================================================================
# PRICE BANDS ENDPOINT - Historical Downside Protection
# ============================================================================

@analytics_bp.route("/projects/<path:project_name>/price-bands", methods=["GET"])
def get_project_price_bands(project_name):
    """
    Get historical price bands (P25/P50/P75) for downside protection analysis.

    Computes percentile bands from resale transactions to help buyers
    assess price floor and downside risk for a specific project.

    Query params:
        - window_months: Analysis window in months (default 24, max 60)
        - unit_psf: Optional user's unit PSF for verdict calculation

    Returns:
        {
            "project_name": "The Continuum",
            "data_source": "project" | "district_proxy" | "segment_proxy",
            "proxy_label": null | "D15 proxy" | "RCR segment proxy",
            "bands": [
                {
                    "month": "2024-01",
                    "count": 12,
                    "p25": 1850, "p50": 1980, "p75": 2150,
                    "p25_s": 1840, "p50_s": 1970, "p75_s": 2140
                }
            ],
            "latest": {"month": "2024-12", "p25_s": 1920, "p50_s": 2050, "p75_s": 2200},
            "trend": {
                "floor_direction": "rising" | "flat" | "weakening",
                "floor_slope_pct": 2.3,
                "observation_months": 6
            },
            "verdict": {
                "unit_psf": 2100,
                "position": "above_median",
                "position_label": "Above Median",
                "vs_floor_pct": 7.5,
                "badge": "protected" | "watch" | "exposed",
                "badge_label": "Protected",
                "explanation": "Unit is 7.5% above a rising floor."
            },
            "data_quality": {
                "total_trades": 156,
                "months_with_data": 18,
                "is_valid": true,
                "fallback_reason": null,
                "window_months": 24,
                "smoothing": "rolling_median_3"
            }
        }
    """
    start = time.time()
    from services.price_bands_service import get_project_price_bands as compute_bands

    try:
        # Parse query params
        window_months = request.args.get('window_months', 24, type=int)
        window_months = min(max(window_months, 6), 60)  # Clamp to 6-60 months

        unit_psf = request.args.get('unit_psf', type=float)
        if unit_psf is not None:
            # Validate PSF range
            if unit_psf < 300 or unit_psf > 10000:
                return jsonify({
                    "error": "unit_psf must be between 300 and 10000"
                }), 400

        # Compute price bands
        result = compute_bands(
            project_name=project_name,
            window_months=window_months,
            unit_psf=unit_psf
        )

        elapsed = time.time() - start
        print(f"GET /api/projects/{project_name}/price-bands completed in {elapsed:.4f}s")

        return jsonify(result)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/projects/{project_name}/price-bands ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# EXIT QUEUE RISK ANALYSIS ENDPOINTS
# =============================================================================

@analytics_bp.route("/projects/resale-projects", methods=["GET"])
def get_resale_projects():
    """
    Get list of all projects from transactions table for dropdown.
    Returns project name, district, transaction counts, and data availability flags.
    """
    start = time.time()

    try:
        from models.database import db
        from sqlalchemy import text
        from services.new_launch_units import get_units_for_project

        # Get all projects from transactions table
        result = db.session.execute(text("""
            SELECT
                project_name,
                district,
                COUNT(*) as transaction_count,
                COUNT(CASE WHEN sale_type = 'RESALE' THEN 1 END) as resale_count
            FROM transactions
            WHERE is_outlier = false
            GROUP BY project_name, district
            ORDER BY project_name
        """)).fetchall()

        projects = []
        for row in result:
            project_name = row[0]
            district = row[1]
            transaction_count = row[2]
            resale_count = row[3]

            # Check if we have unit data for this project
            unit_data = get_units_for_project(project_name)
            has_total_units = unit_data is not None and unit_data.get('units') is not None
            has_top_year = unit_data is not None and unit_data.get('top') is not None

            projects.append({
                "name": project_name,
                "district": district,
                "transaction_count": transaction_count,
                "resale_count": resale_count,
                "has_total_units": has_total_units,
                "has_top_year": has_top_year
            })

        elapsed = time.time() - start
        print(f"GET /projects/resale-projects completed in {elapsed:.4f}s ({len(projects)} projects)")

        return jsonify({
            "projects": projects,
            "count": len(projects)
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /projects/resale-projects ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/projects/<path:project_name>/exit-queue", methods=["GET"])
def get_project_exit_queue(project_name):
    """
    Get exit queue risk analysis for a specific project.

    Returns:
    - data_quality: Completeness flags and warnings
    - fundamentals: Property age, total units, tenure, district
    - resale_metrics: Unique units resold, maturity %, pressure %, absorption speed
    - risk_assessment: Maturity zone, pressure zone, overall risk, interpretation
    - gating_flags: Boutique, brand new, ultra-luxury, thin data, unit-type mixed
    """
    start = time.time()

    try:
        from models.database import db
        from sqlalchemy import text
        from services.new_launch_units import get_units_for_project
        from datetime import datetime, timedelta

        current_year = datetime.now().year
        current_date = datetime.now().date()
        twelve_months_ago = current_date - timedelta(days=365)
        twenty_four_months_ago = current_date - timedelta(days=730)

        # Get unit data from CSV
        unit_data = get_units_for_project(project_name)
        total_units = unit_data.get('units') if unit_data else None
        top_year = unit_data.get('top') if unit_data else None
        tenure = unit_data.get('tenure') if unit_data else None
        developer = unit_data.get('developer') if unit_data else None

        # Get basic transaction stats
        basic_stats = db.session.execute(text("""
            SELECT
                district,
                MIN(contract_date) as first_resale_date,
                COUNT(*) as total_resale_transactions,
                COUNT(CASE WHEN contract_date >= :twelve_months_ago THEN 1 END) as resales_12m,
                COUNT(CASE WHEN contract_date >= :twenty_four_months_ago THEN 1 END) as resales_24m,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price / area_sqft) as median_psf
            FROM transactions
            WHERE project_name = :project_name
              AND is_outlier = false
              AND sale_type = 'RESALE'
            GROUP BY district
        """), {
            "project_name": project_name,
            "twelve_months_ago": twelve_months_ago,
            "twenty_four_months_ago": twenty_four_months_ago
        }).fetchone()

        if not basic_stats:
            return jsonify({
                "project_name": project_name,
                "error": "No resale transactions found for this project",
                "data_quality": {
                    "completeness": "no_resales"
                }
            }), 404

        district = basic_stats[0]
        first_resale_date = basic_stats[1]
        total_resale_transactions = basic_stats[2]
        resales_12m = basic_stats[3]
        resales_24m = basic_stats[4]
        median_psf = float(basic_stats[5]) if basic_stats[5] else None

        # Calculate unique units using floor_range + area_sqft approximation
        unique_units_result = db.session.execute(text("""
            SELECT COUNT(DISTINCT (floor_range || '-' || CAST(area_sqft AS VARCHAR))) as unique_units,
                   COUNT(DISTINCT CASE WHEN contract_date >= :twelve_months_ago
                         THEN (floor_range || '-' || CAST(area_sqft AS VARCHAR)) END) as unique_units_12m
            FROM transactions
            WHERE project_name = :project_name
              AND is_outlier = false
              AND sale_type = 'RESALE'
        """), {
            "project_name": project_name,
            "twelve_months_ago": twelve_months_ago
        }).fetchone()

        unique_resale_units_total = unique_units_result[0] if unique_units_result else 0
        unique_resale_units_12m = unique_units_result[1] if unique_units_result else 0

        # Calculate absorption speed (median days between resales for same unit)
        absorption_speed_days = None
        if resales_24m >= 12:
            absorption_result = db.session.execute(text("""
                WITH unit_resales AS (
                    SELECT
                        (floor_range || '-' || CAST(area_sqft AS VARCHAR)) as unit_key,
                        contract_date,
                        LAG(contract_date) OVER (
                            PARTITION BY (floor_range || '-' || CAST(area_sqft AS VARCHAR))
                            ORDER BY contract_date
                        ) as prev_date
                    FROM transactions
                    WHERE project_name = :project_name
                      AND is_outlier = false
                      AND sale_type = 'RESALE'
                      AND contract_date >= :twenty_four_months_ago
                )
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
                    ORDER BY (contract_date - prev_date)
                ) as median_days
                FROM unit_resales
                WHERE prev_date IS NOT NULL
            """), {
                "project_name": project_name,
                "twenty_four_months_ago": twenty_four_months_ago
            }).fetchone()

            if absorption_result and absorption_result[0]:
                absorption_speed_days = float(absorption_result[0])

        # Calculate property age
        property_age_years = None
        age_source = None

        if top_year:
            if top_year <= current_year:
                property_age_years = current_year - top_year
                age_source = "top_date"
            else:
                # Future TOP - not topped yet
                age_source = "not_topped_yet"
        elif first_resale_date:
            property_age_years = current_year - first_resale_date.year
            age_source = "first_resale"
        else:
            age_source = "insufficient_data"

        # Calculate percentages (only if we have total units)
        resale_maturity_pct = None
        active_exit_pressure_pct = None
        transactions_per_100_units = None

        if total_units and total_units > 0:
            resale_maturity_pct = round((unique_resale_units_total / total_units) * 100, 1)
            active_exit_pressure_pct = round((unique_resale_units_12m / total_units) * 100, 1)
            transactions_per_100_units = round((total_resale_transactions / total_units) * 100, 1)

        # Determine risk zones
        def get_maturity_zone(pct):
            if pct is None:
                return "unknown"
            if pct >= 40:
                return "green"
            if pct >= 15:
                return "yellow"
            return "red"

        def get_pressure_zone(pct):
            if pct is None:
                return "unknown"
            if pct < 5:
                return "green"
            if pct < 10:
                return "yellow"
            return "red"

        maturity_zone = get_maturity_zone(resale_maturity_pct)
        pressure_zone = get_pressure_zone(active_exit_pressure_pct)

        # Determine quadrant and overall risk
        def get_quadrant_and_risk(mat_zone, press_zone):
            if mat_zone == "green" and press_zone == "green":
                return ("proven_low_pressure", "low")
            if mat_zone == "red" and press_zone == "red":
                return ("immature_high_pressure", "elevated")
            if mat_zone == "green" and press_zone == "red":
                return ("proven_high_pressure", "moderate")
            if mat_zone == "red" and press_zone == "green":
                return ("immature_low_pressure", "moderate")
            # Mixed yellow cases
            if mat_zone == "unknown" or press_zone == "unknown":
                return ("insufficient_data", "unknown")
            return ("developing", "moderate")

        quadrant, overall_risk = get_quadrant_and_risk(maturity_zone, pressure_zone)

        # Generate interpretation
        def generate_interpretation(mat_pct, press_pct, mat_zone, press_zone, quadrant):
            if mat_pct is None or press_pct is None:
                return "Cannot generate risk assessment without total units data. Showing raw transaction counts only."

            mat_desc = {
                "green": f"a proven resale market with {mat_pct}% of units having changed hands",
                "yellow": f"a developing resale market with {mat_pct}% of units having resold",
                "red": f"an early-stage resale market with only {mat_pct}% of units having changed hands"
            }

            press_desc = {
                "green": f"Low recent activity ({press_pct}% in 12m) suggests minimal exit pressure",
                "yellow": f"Moderate activity ({press_pct}% in 12m) indicates some selling interest",
                "red": f"High activity ({press_pct}% in 12m) suggests significant exit pressure"
            }

            base = f"This is {mat_desc.get(mat_zone, 'an uncertain market')}. {press_desc.get(press_zone, 'Activity levels unclear')}."

            if quadrant == "proven_low_pressure":
                base += " This is generally a favorable exit queue position."
            elif quadrant == "immature_high_pressure":
                base += " Exercise caution - price discovery is limited while sellers compete."

            return base

        interpretation = generate_interpretation(
            resale_maturity_pct, active_exit_pressure_pct,
            maturity_zone, pressure_zone, quadrant
        )

        # Gating flags
        is_boutique = total_units is not None and total_units < 50
        is_brand_new = property_age_years is not None and property_age_years < 2
        is_ultra_luxury = (
            (median_psf is not None and median_psf > 3000) or
            (district in ['D09', 'D10', 'D11'])
        )
        is_thin_data = unique_resale_units_total < 8 or resales_24m < 10

        # Check for mixed unit types (check bedroom diversity)
        bedroom_check = db.session.execute(text("""
            SELECT COUNT(DISTINCT no_of_bedrooms) as bedroom_types
            FROM transactions
            WHERE project_name = :project_name
              AND is_outlier = false
              AND sale_type = 'RESALE'
        """), {"project_name": project_name}).fetchone()

        unit_type_mixed = bedroom_check and bedroom_check[0] > 1

        # Data quality warnings
        warnings = []
        if not total_units:
            warnings.append("Total units data not available - cannot calculate percentages")
        if not top_year:
            warnings.append("TOP year not available - age calculated from first resale")
        if is_thin_data:
            warnings.append("Limited transaction data - interpret with caution")

        # Calculate sample window
        if first_resale_date:
            sample_window_months = (current_date.year - first_resale_date.year) * 12 + (current_date.month - first_resale_date.month)
        else:
            sample_window_months = 0

        elapsed = time.time() - start
        print(f"GET /projects/{project_name}/exit-queue completed in {elapsed:.4f}s")

        return jsonify({
            "project_name": project_name,
            "data_quality": {
                "has_top_year": top_year is not None,
                "has_total_units": total_units is not None,
                "completeness": "complete" if (top_year and total_units) else "partial",
                "sample_window_months": sample_window_months,
                "warnings": warnings
            },
            "fundamentals": {
                "total_units": total_units,
                "top_year": top_year,
                "property_age_years": property_age_years,
                "age_source": age_source,
                "tenure": tenure,
                "district": district,
                "developer": developer,
                "first_resale_date": first_resale_date.isoformat() if first_resale_date else None
            },
            "resale_metrics": {
                "unique_resale_units_total": unique_resale_units_total,
                "unique_resale_units_12m": unique_resale_units_12m,
                "total_resale_transactions": total_resale_transactions,
                "resale_maturity_pct": resale_maturity_pct,
                "active_exit_pressure_pct": active_exit_pressure_pct,
                "absorption_speed_days": absorption_speed_days,
                "transactions_per_100_units": transactions_per_100_units,
                "resales_last_24m": resales_24m
            },
            "risk_assessment": {
                "maturity_zone": maturity_zone,
                "pressure_zone": pressure_zone,
                "quadrant": quadrant,
                "overall_risk": overall_risk,
                "interpretation": interpretation
            },
            "gating_flags": {
                "is_boutique": is_boutique,
                "is_brand_new": is_brand_new,
                "is_ultra_luxury": is_ultra_luxury,
                "is_thin_data": is_thin_data,
                "unit_type_mixed": unit_type_mixed
            }
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /projects/{project_name}/exit-queue ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
