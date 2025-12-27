"""
Trend Endpoints

Time-series trend endpoints. These are candidates for consolidation into /aggregate.

Endpoints:
- /price_trends_by_district - Price trends grouped by district
- /market_stats_by_district - Market stats grouped by district
- /sale_type_trends - Volume trends by sale type
- /price_trends_by_sale_type - PSF trends by sale type
- /price_trends_by_region - PSF trends by region
- /psf_trends_by_region - Quarterly PSF by region
- /new-vs-resale - New sale vs resale comparison

NOTE: Consider using /aggregate instead:
  /aggregate?group_by=district,month&metrics=median_psf,count
"""

import time
from flask import request, jsonify
from routes.analytics import analytics_bp, reader
from constants import SALE_TYPE_NEW, SALE_TYPE_RESALE
from utils.normalize import (
    to_int, to_date, to_list,
    ValidationError as NormalizeValidationError, validation_error_response
)


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

    try:
        bedrooms = to_list(request.args.get("bedroom"), item_type=int, field="bedroom")
    except NormalizeValidationError as e:
        return validation_error_response(e)

    segment = request.args.get("segment")

    # Parse date params as Python date objects (not strings)
    try:
        date_from = to_date(request.args.get("date_from"), field="date_from")
        date_to = to_date(request.args.get("date_to"), field="date_to")
    except NormalizeValidationError as e:
        return validation_error_response(e)

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

