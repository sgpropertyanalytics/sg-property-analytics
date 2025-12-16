"""
Analytics API Routes - Lightweight read-only endpoints

All routes now read from PreComputedStats table - no calculations, no Pandas.
Fast and efficient.
"""

from flask import Blueprint, request, jsonify
import time
from services.analytics_reader import get_reader

analytics_bp = Blueprint('analytics', __name__)
reader = get_reader()


@analytics_bp.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    from models.transaction import Transaction
    from models.database import db
    
    try:
        count = db.session.query(Transaction).count()
        metadata = reader.get_metadata()
        return jsonify({
            "status": "healthy",
            "data_loaded": count > 0,
            "row_count": count,
            "stats_computed": metadata.get("last_updated") is not None,
            "last_updated": metadata.get("last_updated")
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500


@analytics_bp.route("/resale_stats", methods=["GET"])
def resale_stats():
    """Get resale statistics for 2, 3, 4-Bedroom condos."""
    start = time.time()
    
    districts_param = request.args.get("districts")
    segment = request.args.get("segment")
    
    # For now, return pre-computed stats (filtering can be added later)
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
    
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func
    
    district = request.args.get("district")
    bedroom_param = request.args.get("bedroom", "2,3,4")
    
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
        # Query projects for this district
        results = db.session.query(
            Transaction.project_name,
            func.sum(Transaction.price).label('total'),
            func.count(Transaction.id).label('count')
        ).filter(
            Transaction.district == d,
            Transaction.bedroom_count.in_(bedroom_types)
        ).group_by(Transaction.project_name).all()
        
        projects = []
        for row in results:
            projects.append({
                'project_name': row.project_name,
                'total': float(row.total),
                'count': int(row.count)
            })
        
        projects.sort(key=lambda x: x['total'], reverse=True)
        
        data = {"projects": projects}
        elapsed = time.time() - start
        print(f"GET /api/projects_by_district took: {elapsed:.4f} seconds")
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
        project_data = defaultdict(lambda: {'prices': [], 'psfs': []})
        
        for txn in transactions:
            project_data[txn.project_name]['prices'].append(txn.price)
            project_data[txn.project_name]['psfs'].append(txn.psf)
        
        projects = []
        for project_name, data in project_data.items():
            if len(data['prices']) < 3:
                continue
            
            prices = sorted(data['prices'])
            psfs = sorted(data['psfs'])
            
            def quartile(arr, q):
                idx = int(len(arr) * q)
                return arr[idx] if idx < len(arr) else arr[-1]
            
            projects.append({
                'project_name': project_name,
                'price_25th': quartile(prices, 0.25),
                'price_median': quartile(prices, 0.5),
                'price_75th': quartile(prices, 0.75),
                'psf_25th': quartile(psfs, 0.25),
                'psf_median': quartile(psfs, 0.5),
                'psf_75th': quartile(psfs, 0.75),
                'count': len(data['prices'])
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
            query = query.filter(Transaction.sale_type == sale_type)
        
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
    """Get dual-view market analysis: Short-Term (6 months) vs Long-Term (12 months)."""
    start = time.time()
    
    try:
        stats = reader.get_market_stats()
        elapsed = time.time() - start
        print(f"GET /api/market_stats took: {elapsed:.4f} seconds")
        return jsonify(stats)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/market_stats ERROR (took {elapsed:.4f}s): {e}")
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
    """Get dual-view market analysis by district: Short-Term (6 months) vs Long-Term (12 months)."""
    start = time.time()
    
    try:
        stats = reader.get_market_stats_by_district()
        elapsed = time.time() - start
        print(f"GET /api/market_stats_by_district took: {elapsed:.4f} seconds")
        return jsonify(stats)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/market_stats_by_district ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/sale_type_trends", methods=["GET"])
def sale_type_trends():
    """Get transaction counts by sale type (New Sale vs Resale) over time by quarter."""
    start = time.time()
    
    try:
        trends = reader.get_sale_type_trends()
        elapsed = time.time() - start
        print(f"GET /api/sale_type_trends took: {elapsed:.4f} seconds")
        return jsonify(trends)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/sale_type_trends ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/price_trends_by_sale_type", methods=["GET"])
def price_trends_by_sale_type():
    """Get median price trends by sale type (New Sale vs Resale) over time by quarter, separated by bedroom type."""
    start = time.time()
    
    try:
        trends = reader.get_price_trends_by_sale_type()
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_sale_type took: {elapsed:.4f} seconds")
        return jsonify(trends)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_sale_type ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/price_trends_by_region", methods=["GET"])
def price_trends_by_region():
    """Get median price trends by region (CCR, RCR, OCR) over time by quarter."""
    start = time.time()
    
    try:
        trends = reader.get_price_trends_by_region()
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_region took: {elapsed:.4f} seconds")
        return jsonify(trends)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_region ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/psf_trends_by_region", methods=["GET"])
def psf_trends_by_region():
    """Get median PSF trends by region (CCR, RCR, OCR) over time by quarter."""
    start = time.time()
    
    try:
        trends = reader.get_psf_trends_by_region()
        elapsed = time.time() - start
        print(f"GET /api/psf_trends_by_region took: {elapsed:.4f} seconds")
        return jsonify(trends)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/psf_trends_by_region ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500
