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

            # Segment filter
            if request.args.get('segment'):
                filters['segment'] = request.args.get('segment').strip().upper()

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

            # Project filter
            if request.args.get('project'):
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

            skip_cache = request.args.get('skip_cache', '').lower() == 'true'

        # Get dashboard data
        result = get_dashboard_data(
            filters=filters,
            panels=panels_param if panels_param else None,
            options=options if options else None,
            skip_cache=skip_cache
        )

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
      - districts: comma-separated districts to filter (optional)
      - segment: Market segment filter ("CCR", "RCR", or "OCR") (optional)
    
    Note: Currently returns pre-computed stats. Filtering by districts/segment
    is accepted but may not be fully applied if pre-computed stats don't have variants.
    For full filtering support, consider switching to live computation.
    """
    start = time.time()
    
    districts_param = request.args.get("districts")
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
    districts_param = request.args.get("districts")
    bedroom_param = request.args.get("bedroom", "2,3,4")
    limit_param = request.args.get("limit", "200000")
    segment = request.args.get("segment")
    
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
        limit = int(limit_param)
    except ValueError:
        return jsonify({"error": "Invalid parameter"}), 400
    
    query = db.session.query(Transaction)
    
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
    
    # Segment filter (requires market segment calculation)
    if segment:
        from services.data_processor import _get_market_segment
        all_districts = db.session.query(Transaction.district).distinct().all()
        segment_districts = [
            d[0] for d in all_districts 
            if _get_market_segment(d[0]) == segment.strip().upper()
        ]
        query = query.filter(Transaction.district.in_(segment_districts))
    
    transactions = query.limit(limit).all()
    result = [t.to_dict() for t in transactions]
    
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
      - districts: optional comma-separated list of districts
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
    
    districts_param = request.args.get("districts", "").strip()
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
        query = db.session.query(Transaction).filter(
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
        
        points = [t.to_dict() for t in transactions]
        
        # Calculate summary stats
        if points:
            prices = [p['price'] for p in points]
            psfs = [p['psf'] for p in points]
            summary = {
                'count': len(points),
                'price_median': sorted(prices)[len(prices)//2] if prices else None,
                'psf_median': sorted(psfs)[len(psfs)//2] if psfs else None
            }
        else:
            summary = {'count': 0, 'price_median': None, 'psf_median': None}
        
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
      - districts: comma-separated districts to filter (optional)
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
    
    # Parse districts parameter (optional)
    districts_param = request.args.get("districts")
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
      - districts: comma-separated districts to filter (optional)
      - segment: Market segment filter ("CCR", "RCR", or "OCR") (optional)
    """
    start = time.time()
    
    # Parse districts parameter (optional)
    districts_param = request.args.get("districts")
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
      - districts: comma-separated districts to filter (optional)
      - segment: Market segment filter ("CCR", "RCR", or "OCR") (optional)
    """
    start = time.time()
    
    # Parse bedroom parameter
    bedroom_param = request.args.get("bedroom", "2,3,4")
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    # Parse districts parameter (optional)
    districts_param = request.args.get("districts")
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
      - districts: comma-separated districts to filter (optional, but ignored for region analysis)
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

    Query params:
      - group_by: comma-separated dimensions (month, quarter, year, district, bedroom, sale_type, project, region)
      - metrics: comma-separated metrics (count, median_psf, avg_psf, total_value, median_price, avg_price, min_psf, max_psf)
      - district: comma-separated districts (D01,D02,...)
      - bedroom: comma-separated bedroom counts (2,3,4)
      - segment: CCR, RCR, OCR
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

    # Build filter conditions (we'll reuse these)
    filter_conditions = []
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

    # Segment filter (market segment based on district)
    segment = request.args.get("segment")
    if segment:
        all_districts = db.session.query(Transaction.district).distinct().all()
        segment_districts = [
            d[0] for d in all_districts
            if _get_market_segment(d[0]) == segment.strip().upper()
        ]
        filter_conditions.append(Transaction.district.in_(segment_districts))
        filters_applied["segment"] = segment.upper()

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

    # Project filter (partial match)
    project = request.args.get("project")
    if project:
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
            # CCR districts
            ccr_districts = ['D01', 'D02', 'D06', 'D09', 'D10', 'D11']
            # RCR districts
            rcr_districts = ['D03', 'D04', 'D05', 'D07', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20']
            # OCR is everything else
            region_case = case(
                (Transaction.district.in_(ccr_districts), literal('CCR')),
                (Transaction.district.in_(rcr_districts), literal('RCR')),
                else_=literal('OCR')
            )
            group_columns.append(region_case)
            select_columns.append(region_case.label("region"))

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
            "note": "median values are approximated using avg for memory efficiency"
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
    from sqlalchemy import desc, asc

    start = time.time()

    # Pagination params
    # No max limit - allow fetching all records for accurate histogram analysis
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 50))
    sort_by = request.args.get("sort_by", "transaction_date")
    sort_order = request.args.get("sort_order", "desc")

    # Build query with same filters as aggregate
    query = db.session.query(Transaction)

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

    # Segment filter
    segment = request.args.get("segment")
    if segment:
        from services.data_processor import _get_market_segment
        all_districts = db.session.query(Transaction.district).distinct().all()
        segment_districts = [
            d[0] for d in all_districts
            if _get_market_segment(d[0]) == segment.strip().upper()
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

    # Project filter
    project = request.args.get("project")
    if project:
        query = query.filter(Transaction.project_name.ilike(f"%{project}%"))

    # Get total count before pagination
    total_records = query.count()
    total_pages = (total_records + limit - 1) // limit

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

    return jsonify({
        "transactions": [t.to_dict() for t in transactions],
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
        # Get distinct values for each dimension
        districts = [d[0] for d in db.session.query(distinct(Transaction.district)).order_by(Transaction.district).all()]
        bedrooms = [b[0] for b in db.session.query(distinct(Transaction.bedroom_count)).order_by(Transaction.bedroom_count).all() if b[0]]
        sale_types = [s[0] for s in db.session.query(distinct(Transaction.sale_type)).all() if s[0]]
        projects = [p[0] for p in db.session.query(distinct(Transaction.project_name)).order_by(Transaction.project_name).limit(500).all() if p[0]]

        # Get date range
        min_date = db.session.query(func.min(Transaction.transaction_date)).scalar()
        max_date = db.session.query(func.max(Transaction.transaction_date)).scalar()

        # Get PSF range
        psf_stats = db.session.query(
            func.min(Transaction.psf),
            func.max(Transaction.psf)
        ).first()

        # Get size range
        size_stats = db.session.query(
            func.min(Transaction.area_sqft),
            func.max(Transaction.area_sqft)
        ).first()

        # Get tenure options
        tenures = [t[0] for t in db.session.query(distinct(Transaction.tenure)).all() if t[0]]

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
      - districts: comma-separated districts to filter (optional, but ignored for region analysis)
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
    New Launch vs Resale (Lease age < 10 years) comparison.

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
