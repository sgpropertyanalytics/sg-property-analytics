"""
Precomputed Stats Endpoints (Legacy)

These endpoints read from precomputed_stats table.
Consider migrating to /aggregate for full filter support.

Endpoints:
- /resale_stats - Precomputed resale statistics
- /price_trends - Price trends by month
- /total_volume - Volume by district
- /avg_psf - Average PSF by district
- /districts - List of districts
- /market_stats - Market overview stats
"""

import time
from flask import request, jsonify
from routes.analytics import analytics_bp, reader
from api.contracts.wrapper import api_contract


@analytics_bp.route("/resale_stats", methods=["GET"])
@api_contract("precomputed/resale-stats")
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


@analytics_bp.route("/price_trends", methods=["GET"])
@api_contract("precomputed/price-trends")
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
@api_contract("precomputed/total-volume")
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
@api_contract("precomputed/avg-psf")
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


@analytics_bp.route("/districts", methods=["GET"])
@api_contract("precomputed/districts")
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
@api_contract("precomputed/market-stats")
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


