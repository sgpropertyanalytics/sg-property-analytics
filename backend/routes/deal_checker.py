"""
Deal Checker API Routes

Provides endpoints for the Deal Checker feature:
- /api/deal-checker/multi-scope - Enhanced endpoint with same-project, 1km, and 2km scopes
- /api/projects/names - Get project names for dropdown

CRITICAL: All queries MUST include COALESCE(is_outlier, false) = false filter
"""
from flask import Blueprint, request, jsonify
from models.project_location import ProjectLocation
from models.transaction import Transaction
from models.database import db
from services.school_distance import haversine
from sqlalchemy import func, and_
from db.sql import exclude_outliers
import time
import statistics
from utils.normalize import (
    to_float,
    ValidationError as NormalizeValidationError, validation_error_response
)

deal_checker_bp = Blueprint('deal_checker', __name__)

# Import contract versioning for HTTP header
from schemas.api_contract import API_CONTRACT_HEADER, CURRENT_API_CONTRACT_VERSION
from api.contracts.wrapper import api_contract


@deal_checker_bp.after_request
def add_contract_version_header(response):
    """Add X-API-Contract-Version header to all deal checker responses."""
    response.headers[API_CONTRACT_HEADER] = CURRENT_API_CONTRACT_VERSION
    return response


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


def get_bedroom_filter(bedroom):
    """
    Get SQLAlchemy filter condition for bedroom count.

    - Bedrooms 1-4: Exact match
    - Bedroom 5+: Matches 5 or more (for "5+ BR" option in frontend)

    Args:
        bedroom: Bedroom count (int)

    Returns:
        SQLAlchemy filter condition
    """
    if bedroom >= 5:
        return Transaction.bedroom_count >= 5
    return Transaction.bedroom_count == bedroom


def compute_scope_stats(project_names, bedroom, buyer_price, sqft=None):
    """
    Compute histogram and percentile for a set of projects.

    Args:
        project_names: List of project names to include
        bedroom: Bedroom count filter
        buyer_price: Buyer's price for percentile calculation
        sqft: Optional unit size for ±15% range filtering

    Returns:
        Dict with histogram, percentile, median_psf, transaction_count
    """
    if not project_names:
        return {
            "histogram": {"bins": [], "total_count": 0},
            "percentile": compute_percentile(buyer_price, []),
            "median_psf": None,
            "median_price": None,
            "transaction_count": 0
        }

    # Query transactions for these projects
    # Note: bedroom >= 5 handles "5+ BR" option from frontend
    query = db.session.query(
        Transaction.price,
        Transaction.psf,
        Transaction.area_sqft
    ).filter(
        exclude_outliers(Transaction),
        Transaction.project_name.in_(project_names),
        get_bedroom_filter(bedroom)
    )

    # If sqft provided, filter to ±15% range for better comparison
    # This helps compare similar-sized units (compact vs deluxe variants)
    if sqft:
        sqft_min = sqft * 0.85
        sqft_max = sqft * 1.15
        query = query.filter(
            Transaction.area_sqft >= sqft_min,
            Transaction.area_sqft <= sqft_max
        )

    transactions = query.all()

    prices = [t.price for t in transactions if t.price]
    psfs = [t.psf for t in transactions if t.psf]

    return {
        "histogram": {
            "bins": compute_histogram_bins(prices, num_bins=20),
            "total_count": len(prices)
        },
        "percentile": compute_percentile(buyer_price, prices),
        "median_psf": round(statistics.median(psfs)) if psfs else None,
        "median_price": round(statistics.median(prices)) if prices else None,
        "transaction_count": len(prices)
    }


@deal_checker_bp.route("/deal-checker/multi-scope", methods=["GET"])
@api_contract("deal-checker/multi-scope")
def get_multi_scope_comparison():
    """
    Enhanced endpoint with multi-scope comparison.

    PREMIUM FEATURE: Requires active subscription.

    Returns data for three comparison scopes:
    - same_project: Transactions in the exact same project
    - radius_1km: Transactions within 1km radius (includes same project)
    - radius_2km: Transactions within 2km radius (includes 1km)

    Query params:
        project_name (required): Name of the project
        bedroom (required): Bedroom count (1-5)
        price (required): Buyer's price paid
        sqft (optional): Unit size in sqft

    Returns:
        JSON with scopes data, map_data, and project info
    """
    # SECURITY: Premium feature - require subscription
    from utils.subscription import is_premium_user
    if not is_premium_user():
        return jsonify({
            "error": "Premium subscription required",
            "code": "PREMIUM_REQUIRED",
            "message": "The Deal Checker is a premium feature. Subscribe to analyze your deals."
        }), 403

    start_time = time.time()

    # Get and validate parameters
    project_name = request.args.get('project_name')
    bedroom = request.args.get('bedroom')
    buyer_price = request.args.get('price')
    sqft = request.args.get('sqft')

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

    # Get project coordinates
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

    # Find all projects within 2km (max radius) - single query
    all_nearby = find_projects_within_radius(center_lat, center_lng, 2.0)

    # Categorize projects by distance
    projects_same = [project_name]  # Same project only
    projects_1km = [p['project_name'] for p in all_nearby if p['distance_km'] <= 1.0]
    projects_2km = [p['project_name'] for p in all_nearby]  # All within 2km

    # Ensure the selected project is included
    if project_name not in projects_1km:
        projects_1km.insert(0, project_name)
    if project_name not in projects_2km:
        projects_2km.insert(0, project_name)

    # Compute stats for each scope (pass sqft for size-based filtering)
    scope_same = compute_scope_stats(projects_same, bedroom, buyer_price, sqft)
    scope_1km = compute_scope_stats(projects_1km, bedroom, buyer_price, sqft)
    scope_2km = compute_scope_stats(projects_2km, bedroom, buyer_price, sqft)

    # Get transaction stats per project for map display and table
    # Includes count, median price, p25/p75 prices, median sqft, and median property age
    # For age: use lease_start_year if available, else estimate from earliest transaction year
    from datetime import date
    from sqlalchemy import text
    current_year = date.today().year

    # Use raw SQL for age calculation
    # Age = current_year - lease_start_year (for leasehold only)
    # Freehold properties: return NULL (we don't have reliable TOP year data)
    # SQL Guardrails: Use :param style for all parameters (no f-string interpolation)
    age_query = text("""
        SELECT
            project_name,
            COUNT(*) as count,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price) as p25_price,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as median_price,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price) as p75_price,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY area_sqft) as median_sqft,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY :current_year - lease_start_year)
                FILTER (WHERE lease_start_year IS NOT NULL) as median_age,
            BOOL_AND(lease_start_year IS NULL) as is_freehold
        FROM transactions
        WHERE COALESCE(is_outlier, false) = false
          AND project_name = ANY(:project_names)
          AND (
              (bedroom_count >= 5 AND :bedroom_is_5plus = true)
              OR (bedroom_count = :bedroom AND :bedroom_is_5plus = false)
          )
        GROUP BY project_name
    """)

    tx_stats = db.session.execute(
        age_query,
        {
            "current_year": current_year,
            "project_names": projects_2km,
            "bedroom": bedroom,
            "bedroom_is_5plus": bedroom >= 5
        }
    ).fetchall()

    tx_stats_map = {
        t.project_name: {
            'count': t.count,
            'p25_price': round(t.p25_price) if t.p25_price else None,
            'median_price': round(t.median_price) if t.median_price else None,
            'p75_price': round(t.p75_price) if t.p75_price else None,
            'median_sqft': round(t.median_sqft) if t.median_sqft else None,
            'median_age': round(t.median_age) if t.median_age is not None else None,  # Handle age=0
            'is_freehold': t.is_freehold
        }
        for t in tx_stats
    }

    # Categorize nearby projects for map with transaction counts
    projects_in_1km = []
    projects_in_2km_only = []  # Projects between 1-2km

    for p in all_nearby:
        stats = tx_stats_map.get(p['project_name'], {'count': 0, 'p25_price': None, 'median_price': None, 'p75_price': None, 'median_sqft': None, 'median_age': None, 'is_freehold': None})
        p_data = {
            'project_name': p['project_name'],
            'latitude': p['latitude'],
            'longitude': p['longitude'],
            'district': p['district'],
            'distance_km': p['distance_km'],
            'transaction_count': stats['count'],
            'p25_price': stats['p25_price'],
            'median_price': stats['median_price'],
            'p75_price': stats['p75_price'],
            'median_sqft': stats['median_sqft'],
            'median_age': stats['median_age'],
            'is_freehold': stats['is_freehold'],
            'bedroom': bedroom
        }

        if p['distance_km'] <= 1.0:
            projects_in_1km.append(p_data)
        else:
            projects_in_2km_only.append(p_data)

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
            "buyer_price": buyer_price,
            "buyer_sqft": sqft
        },
        "scopes": {
            "same_project": scope_same,
            "radius_1km": scope_1km,
            "radius_2km": scope_2km
        },
        "map_data": {
            "center": {"lat": center_lat, "lng": center_lng},
            "projects_1km": projects_in_1km,
            "projects_2km": projects_in_2km_only
        },
        "meta": {
            "elapsed_ms": elapsed_ms,
            "projects_in_1km": len(projects_in_1km),
            "projects_in_2km": len(projects_in_1km) + len(projects_in_2km_only)
        }
    })


@deal_checker_bp.route("/projects/names", methods=["GET"])
@api_contract("deal-checker/project-names")
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
