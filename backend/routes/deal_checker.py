"""
Deal Checker API Routes

Provides endpoints for the Deal Checker feature:
- /api/deal-checker/nearby-transactions - Find transactions within radius, compute histogram
- /api/projects/names - Get project names for dropdown

CRITICAL: All queries MUST include is_outlier = false filter
"""
from flask import Blueprint, request, jsonify
from models.project_location import ProjectLocation
from models.transaction import Transaction
from models.database import db
from services.school_distance import haversine
from sqlalchemy import func, and_, or_
import time

deal_checker_bp = Blueprint('deal_checker', __name__)


def find_projects_within_radius(center_lat, center_lng, radius_km):
    """
    Find all geocoded projects within radius_km of center point.

    Uses haversine distance calculation in Python (no PostGIS available).
    Memory-safe: Only loads lat/lng/name, not full records.

    Args:
        center_lat: Center point latitude
        center_lng: Center point longitude
        radius_km: Radius in kilometers

    Returns:
        List of dicts with project_name, lat, lng, distance_km
    """
    # Query all geocoded projects (lightweight columns only)
    projects = db.session.query(
        ProjectLocation.project_name,
        ProjectLocation.latitude,
        ProjectLocation.longitude,
        ProjectLocation.district
    ).filter(
        ProjectLocation.geocode_status == 'success',
        ProjectLocation.latitude.isnot(None),
        ProjectLocation.longitude.isnot(None)
    ).all()

    nearby = []
    for p in projects:
        try:
            dist_meters = haversine(
                center_lat, center_lng,
                float(p.latitude), float(p.longitude)
            )
            dist_km = dist_meters / 1000  # Convert meters to km

            if dist_km <= radius_km:
                nearby.append({
                    'project_name': p.project_name,
                    'latitude': float(p.latitude),
                    'longitude': float(p.longitude),
                    'district': p.district,
                    'distance_km': round(dist_km, 3)
                })
        except (ValueError, TypeError):
            continue

    # Sort by distance
    nearby.sort(key=lambda x: x['distance_km'])
    return nearby


def compute_histogram_bins(prices, num_bins=20):
    """
    Compute histogram bins from price list.
    Server-side computation to avoid sending all prices to client.

    Args:
        prices: List of price values
        num_bins: Target number of bins

    Returns:
        List of dicts with start, end, count
    """
    if not prices:
        return []

    min_price = min(prices)
    max_price = max(prices)

    if min_price == max_price:
        return [{"start": int(min_price), "end": int(max_price), "count": len(prices)}]

    # Calculate bin size, rounded to nice number
    range_size = max_price - min_price
    raw_bin_size = range_size / num_bins

    # Round bin size to nearest 50K for prices > $1M, 10K otherwise
    if raw_bin_size > 100000:
        bin_size = round(raw_bin_size / 50000) * 50000
    else:
        bin_size = round(raw_bin_size / 10000) * 10000

    bin_size = max(bin_size, 10000)  # Minimum $10K bins

    # Align start to bin size
    start = (int(min_price) // bin_size) * bin_size

    bins = []
    current = start
    while current < max_price:
        end = current + bin_size
        # Last bin includes the max value
        if end >= max_price:
            count = sum(1 for p in prices if current <= p <= max_price)
        else:
            count = sum(1 for p in prices if current <= p < end)

        bins.append({
            "start": int(current),
            "end": int(end),
            "count": count
        })
        current = end

    return bins


def compute_percentile(buyer_price, prices):
    """
    Compute what percentile the buyer's price falls at.
    Returns percentage of comparable transactions priced HIGHER than buyer.

    Higher percentile = better deal (more people paid more than you)

    Args:
        buyer_price: The price the buyer paid
        prices: List of all comparable prices

    Returns:
        Dict with rank, transactions_below, transactions_above, interpretation
    """
    if not prices:
        return {
            "rank": None,
            "transactions_below": 0,
            "transactions_above": 0,
            "total": 0,
            "interpretation": "no_data"
        }

    below = sum(1 for p in prices if p < buyer_price)
    above = sum(1 for p in prices if p > buyer_price)
    equal = sum(1 for p in prices if p == buyer_price)
    total = len(prices)

    # Percentile = what % paid MORE than you (higher = better deal)
    rank = round((above / total) * 100) if total > 0 else 0

    if rank >= 70:
        interpretation = "excellent_deal"
    elif rank >= 50:
        interpretation = "good_deal"
    elif rank >= 30:
        interpretation = "fair_deal"
    else:
        interpretation = "above_average"

    return {
        "rank": rank,
        "transactions_below": below,
        "transactions_above": above,
        "transactions_equal": equal,
        "total": total,
        "interpretation": interpretation
    }


@deal_checker_bp.route("/deal-checker/nearby-transactions", methods=["GET"])
def get_nearby_transactions():
    """
    Find transactions within radius of a project, filtered by bedroom type.

    Query params:
        project_name (required): Name of the project
        bedroom (required): Bedroom count (1-5)
        price (required): Buyer's price paid
        sqft (optional): Unit size in sqft
        radius_km (optional): Search radius, default 1.0

    Returns:
        JSON with project info, histogram, percentile, nearby projects
    """
    start_time = time.time()

    # Get and validate parameters
    project_name = request.args.get('project_name')
    bedroom = request.args.get('bedroom')
    buyer_price = request.args.get('price')
    sqft = request.args.get('sqft')
    radius_km = float(request.args.get('radius_km', 1.0))

    if not all([project_name, bedroom, buyer_price]):
        return jsonify({
            "error": "Missing required parameters: project_name, bedroom, price"
        }), 400

    try:
        bedroom = int(bedroom)
        buyer_price = float(buyer_price)
        sqft = float(sqft) if sqft else None
    except ValueError:
        return jsonify({"error": "Invalid parameter format"}), 400

    # Get project coordinates from ProjectLocation
    project = ProjectLocation.query.filter_by(
        project_name=project_name,
        geocode_status='success'
    ).first()

    if not project or not project.latitude or not project.longitude:
        return jsonify({
            "error": f"Project '{project_name}' not found or not geocoded"
        }), 404

    center_lat = float(project.latitude)
    center_lng = float(project.longitude)

    # Find all projects within radius
    nearby_projects = find_projects_within_radius(center_lat, center_lng, radius_km)
    nearby_project_names = [p['project_name'] for p in nearby_projects]

    if not nearby_project_names:
        return jsonify({
            "error": "No projects found within radius"
        }), 404

    # Query transactions for those projects with SAME bedroom type
    # CRITICAL: Always exclude outliers
    query = db.session.query(Transaction.price).filter(
        or_(Transaction.is_outlier == False, Transaction.is_outlier.is_(None)),
        Transaction.project_name.in_(nearby_project_names),
        Transaction.bedroom_count == bedroom
    )

    transactions = query.all()
    prices = [t.price for t in transactions]

    # Compute histogram bins (server-side aggregation)
    bins = compute_histogram_bins(prices, num_bins=20)

    # Compute percentile rank
    percentile_data = compute_percentile(buyer_price, prices)

    # Add transaction count to nearby projects
    tx_counts = db.session.query(
        Transaction.project_name,
        func.count(Transaction.id).label('count')
    ).filter(
        or_(Transaction.is_outlier == False, Transaction.is_outlier.is_(None)),
        Transaction.project_name.in_(nearby_project_names),
        Transaction.bedroom_count == bedroom
    ).group_by(Transaction.project_name).all()

    tx_count_map = {t.project_name: t.count for t in tx_counts}

    for p in nearby_projects:
        p['transaction_count'] = tx_count_map.get(p['project_name'], 0)

    elapsed_ms = int((time.time() - start_time) * 1000)

    return jsonify({
        "project": {
            "name": project_name,
            "district": project.district,
            "market_segment": project.market_segment,
            "latitude": center_lat,
            "longitude": center_lng
        },
        "filters": {
            "bedroom": bedroom,
            "radius_km": radius_km,
            "buyer_price": buyer_price,
            "buyer_sqft": sqft
        },
        "histogram": {
            "bins": bins,
            "total_count": len(prices)
        },
        "percentile": percentile_data,
        "nearby_projects": nearby_projects[:50],  # Limit for performance
        "meta": {
            "elapsed_ms": elapsed_ms,
            "projects_in_radius": len(nearby_projects)
        }
    })


@deal_checker_bp.route("/projects/names", methods=["GET"])
def get_project_names():
    """
    Get list of all project names for dropdown.
    Only includes projects with geocode_status='success'.

    Returns:
        JSON with list of {name, district} objects
    """
    projects = db.session.query(
        ProjectLocation.project_name,
        ProjectLocation.district,
        ProjectLocation.market_segment
    ).filter(
        ProjectLocation.geocode_status == 'success'
    ).order_by(
        ProjectLocation.project_name
    ).all()

    return jsonify({
        "projects": [
            {
                "name": p.project_name,
                "district": p.district,
                "market_segment": p.market_segment
            }
            for p in projects
        ],
        "count": len(projects)
    })
