"""
Chart-Specific Endpoints

Specialized chart data endpoints that go beyond /aggregate.
Includes project-level drilldowns, heatmaps, and price band analysis.

Endpoints:
- /projects_by_district - Project-level volume breakdown
- /price_projects_by_district - Project price quartiles
- /floor-liquidity-heatmap - Floor zone liquidity analysis
- /budget-heatmap - Market activity by bedroom and age
"""

import time
from flask import request, jsonify
from routes.analytics import analytics_bp
from constants import SALE_TYPE_NEW, SALE_TYPE_RESALE
from utils.normalize import (
    to_int, to_list, to_bool,
    ValidationError as NormalizeValidationError, validation_error_response
)
from api.contracts.wrapper import api_contract


@analytics_bp.route("/projects_by_district", methods=["GET"])
@api_contract("charts/projects-by-district")
def projects_by_district():
    """Get project-level volume and quantity breakdown for a specific district."""
    start = time.time()
    from services.data_processor import get_project_aggregation_by_district

    district = request.args.get("district")
    segment = request.args.get("segment")  # Optional: CCR, RCR, OCR

    if not district:
        return jsonify({"error": "district parameter is required"}), 400

    try:
        bedroom_types = to_list(
            request.args.get("bedroom"),
            item_type=int,
            default=[2, 3, 4],
            field="bedroom"
        )
    except NormalizeValidationError as e:
        return validation_error_response(e)

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
@api_contract("charts/price-projects-by-district")
def price_projects_by_district():
    """
    Project-level price / PSF quartiles for a given district and timeframe.
    Query params:
      - district: e.g. D10
      - bedroom: comma-separated bedroom counts, e.g. 2,3,4
      - months: timeframe length (default 15)
    """
    from datetime import datetime, timedelta

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

        query = _build_price_projects_by_district_query(
            district=d,
            bedroom_types=bedroom_types,
            cutoff_date=cutoff_date
        )

        rows = query.all()

        projects = []
        for row in rows:
            # Determine sale_type_label (New Launch vs Resale)
            sale_type_label = None
            if row.new_sale_count > row.resale_count:
                sale_type_label = 'New Launch'
            elif row.resale_count > 0:
                sale_type_label = 'Resale'

            projects.append({
                'project_name': row.project_name,
                'price_25th': row.price_25th,
                'price_median': row.price_median,
                'price_75th': row.price_75th,
                'psf_25th': row.psf_25th,
                'psf_median': row.psf_median,
                'psf_75th': row.psf_75th,
                'count': row.transaction_count,
                'sale_type_label': sale_type_label
            })

        return jsonify({"projects": projects})
    except Exception as e:
        print(f"GET /api/price_projects_by_district ERROR: {e}")
        return jsonify({"error": str(e)}), 500


def _build_price_projects_by_district_query(district, bedroom_types, cutoff_date):
    """Build SQL-only aggregation query for project price quartiles."""
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, case
    from db.sql import exclude_outliers

    query = db.session.query(
        Transaction.project_name.label('project_name'),
        func.count(Transaction.id).label('transaction_count'),
        func.percentile_cont(0.25).within_group(Transaction.price).label('price_25th'),
        func.percentile_cont(0.50).within_group(Transaction.price).label('price_median'),
        func.percentile_cont(0.75).within_group(Transaction.price).label('price_75th'),
        func.percentile_cont(0.25).within_group(Transaction.psf).label('psf_25th'),
        func.percentile_cont(0.50).within_group(Transaction.psf).label('psf_median'),
        func.percentile_cont(0.75).within_group(Transaction.psf).label('psf_75th'),
        func.sum(case((Transaction.sale_type == SALE_TYPE_NEW, 1), else_=0)).label('new_sale_count'),
        func.sum(case((Transaction.sale_type == SALE_TYPE_RESALE, 1), else_=0)).label('resale_count'),
    ).filter(
        Transaction.district == district,
        Transaction.bedroom_count.in_(bedroom_types),
        Transaction.transaction_date >= cutoff_date,
        exclude_outliers(Transaction)
    ).group_by(
        Transaction.project_name
    ).having(
        func.count(Transaction.id) >= 3
    ).order_by(
        func.count(Transaction.id).desc()
    )

    return query


@analytics_bp.route("/floor-liquidity-heatmap", methods=["GET"])
@api_contract("charts/floor-liquidity-heatmap")
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
    from db.sql import exclude_outliers
    from constants import get_region_for_district
    from services.dashboard_service import _dashboard_cache
    from services.new_launch_units import get_units_for_project

    start = time.time()

    try:
        # Parse parameters
        window_months = to_int(request.args.get('window_months'), default=12, field='window_months')
        if window_months not in [6, 12, 24]:
            window_months = 12

        # Exclusion thresholds for reliable liquidity analysis
        min_transactions = to_int(request.args.get('min_transactions'), default=30, field='min_transactions')
        min_units = to_int(request.args.get('min_units'), default=100, field='min_units')
        limit = to_int(request.args.get('limit'), default=0, field='limit')  # 0 = no limit
        skip_cache = to_bool(request.args.get('skip_cache'), default=False)
    except NormalizeValidationError as e:
        return validation_error_response(e)

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
        exclude_outliers(Transaction),
        func.lower(Transaction.sale_type) == SALE_TYPE_RESALE.lower(),
        Transaction.floor_level.isnot(None),
        Transaction.floor_level != 'Unknown'
    ]
    filters_applied = {'sale_type': SALE_TYPE_RESALE, 'window_months': window_months}

    # Date filter based on window
    cutoff_date = datetime.now().date() - timedelta(days=window_months * 30)
    filter_conditions.append(Transaction.transaction_date >= cutoff_date)
    filters_applied['date_from'] = cutoff_date.isoformat()

    # Segment filter
    segment = request.args.get('segment')
    if segment:
        segments = [s.strip().upper() for s in segment.split(',') if s.strip()]
        all_districts = db.session.query(Transaction.district).distinct().all()
        segment_districts = [d[0] for d in all_districts if get_region_for_district(d[0]) in segments]
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
    try:
        bedrooms = to_list(request.args.get('bedroom'), item_type=int, field='bedroom')
        if bedrooms:
            filter_conditions.append(Transaction.bedroom_count.in_(bedrooms))
            filters_applied['bedroom'] = bedrooms
    except NormalizeValidationError as e:
        return validation_error_response(e)

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


@analytics_bp.route("/budget-heatmap", methods=["GET"])
@api_contract("charts/budget-heatmap")
def budget_heatmap():
    """
    Market activity heatmap by bedroom type and property age.

    Shows transaction distribution (percentages) within budget range.
    Used by Value Parity page's Explore Budget tab.

    Query Parameters:
        budget (required): Target budget in SGD
        tolerance: +/- range (default 100000)
        bedroom: Optional bedroom filter (1-5)
        segment: Market segment (CCR/RCR/OCR)
        district: District code (D01-D28)
        tenure: Tenure type (Freehold/99-year/999-year)
        months_lookback: Time window in months (default 24, range 6-60)
    Returns:
        Matrix of transaction percentages by bedroom (X) and age band (Y)
        with k-anonymity suppression for low-count cells.
    """
    from services.budget_analysis_service import (
        get_market_activity_heatmap,
        serialize_heatmap_v2
    )

    try:
        # Parse required budget
        budget = to_int(request.args.get('budget'), field='budget')
        if not budget:
            return jsonify({"error": "budget parameter is required", "type": "validation_error", "field": "budget"}), 400

        if budget < 100000 or budget > 50000000:
            return jsonify({"error": "budget must be between $100K and $50M", "type": "validation_error", "field": "budget"}), 400

        # Parse optional filters
        tolerance = to_int(request.args.get('tolerance'), default=100000, field='tolerance')
        bedroom = to_int(request.args.get('bedroom'), field='bedroom')
        segment = request.args.get('segment')
        district = request.args.get('district')
        tenure = request.args.get('tenure')
        months_lookback = to_int(request.args.get('months_lookback'), default=24, field='months_lookback')
        skip_cache = to_bool(request.args.get('skip_cache'), default=False)
    except NormalizeValidationError as e:
        return validation_error_response(e)

    try:

        # Validate tolerance
        if tolerance < 10000 or tolerance > 500000:
            tolerance = 100000  # Default to 100K if out of range

        # Validate months_lookback (6-60 months)
        if months_lookback < 6 or months_lookback > 60:
            months_lookback = 24  # Default to 24 if out of range

        # Get data
        result = get_market_activity_heatmap(
            budget=budget,
            tolerance=tolerance,
            bedroom=bedroom,
            segment=segment,
            district=district,
            tenure=tenure,
            months_lookback=months_lookback,
            skip_cache=skip_cache
        )

        return jsonify(serialize_heatmap_v2(result))

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
