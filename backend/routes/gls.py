"""
GLS (Government Land Sales) API Routes

Provides endpoints for:
- Upcoming tenders (SIGNAL - leading indicator)
- Awarded tenders (FACT - confirmed supply)
- Supply pipeline aggregation
- Price floor data
"""
from flask import Blueprint, request, jsonify
import time
from models.database import db
from models.gls_tender import GLSTender
from sqlalchemy import desc, asc

gls_bp = Blueprint('gls', __name__)


@gls_bp.route("/upcoming", methods=["GET"])
def get_upcoming():
    """
    Get upcoming (launched) GLS tenders.

    Query params:
        - market_segment: CCR, RCR, or OCR (optional)
        - planning_area: Filter by planning area (optional)
        - limit: Max results (default 50)

    Returns:
        SIGNAL data with disclaimer
    """
    start = time.time()

    market_segment = request.args.get("market_segment")
    planning_area = request.args.get("planning_area")
    limit = int(request.args.get("limit", 50))

    try:
        query = db.session.query(GLSTender).filter(
            GLSTender.status == 'launched'
        )

        if market_segment:
            query = query.filter(GLSTender.market_segment == market_segment.upper())

        if planning_area:
            query = query.filter(GLSTender.planning_area.ilike(f"%{planning_area}%"))

        query = query.order_by(desc(GLSTender.release_date)).limit(limit)
        tenders = query.all()

        elapsed = time.time() - start
        print(f"GET /api/gls/upcoming took: {elapsed:.4f} seconds (returned {len(tenders)} tenders)")

        return jsonify({
            "status": "SIGNAL",
            "disclaimer": "Upcoming tenders - not confirmed supply",
            "count": len(tenders),
            "data": [t.to_dict() for t in tenders]
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/gls/upcoming ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/awarded", methods=["GET"])
def get_awarded():
    """
    Get awarded GLS tenders.

    Query params:
        - market_segment: CCR, RCR, or OCR (optional)
        - planning_area: Filter by planning area (optional)
        - limit: Max results (default 50)

    Returns:
        FACT data with confirmed supply info
    """
    start = time.time()

    market_segment = request.args.get("market_segment")
    planning_area = request.args.get("planning_area")
    limit = int(request.args.get("limit", 50))

    try:
        query = db.session.query(GLSTender).filter(
            GLSTender.status == 'awarded'
        )

        if market_segment:
            query = query.filter(GLSTender.market_segment == market_segment.upper())

        if planning_area:
            query = query.filter(GLSTender.planning_area.ilike(f"%{planning_area}%"))

        query = query.order_by(desc(GLSTender.release_date)).limit(limit)
        tenders = query.all()

        elapsed = time.time() - start
        print(f"GET /api/gls/awarded took: {elapsed:.4f} seconds (returned {len(tenders)} tenders)")

        return jsonify({
            "status": "FACT",
            "disclaimer": "Confirmed supply - capital committed",
            "count": len(tenders),
            "data": [t.to_dict() for t in tenders]
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/gls/awarded ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/all", methods=["GET"])
def get_all():
    """
    Get all GLS tenders (both launched and awarded).

    Query params:
        - market_segment: CCR, RCR, or OCR (optional)
        - status: 'launched' or 'awarded' (optional)
        - planning_area: Filter by planning area (optional)
        - limit: Max results (default 100)
        - sort: Field to sort by (default: release_date)
        - order: asc or desc (default: desc)

    Returns:
        Combined data with status labels on each item
    """
    start = time.time()

    market_segment = request.args.get("market_segment")
    status = request.args.get("status")
    planning_area = request.args.get("planning_area")
    limit = int(request.args.get("limit", 100))
    sort_by = request.args.get("sort", "release_date")
    order = request.args.get("order", "desc")

    try:
        query = db.session.query(GLSTender)

        if market_segment:
            query = query.filter(GLSTender.market_segment == market_segment.upper())

        if status:
            query = query.filter(GLSTender.status == status.lower())

        if planning_area:
            query = query.filter(GLSTender.planning_area.ilike(f"%{planning_area}%"))

        # Apply sorting
        sort_col = getattr(GLSTender, sort_by, GLSTender.release_date)
        if order.lower() == 'asc':
            query = query.order_by(asc(sort_col))
        else:
            query = query.order_by(desc(sort_col))

        query = query.limit(limit)
        tenders = query.all()

        elapsed = time.time() - start
        print(f"GET /api/gls/all took: {elapsed:.4f} seconds (returned {len(tenders)} tenders)")

        # Count by status
        launched_count = sum(1 for t in tenders if t.status == 'launched')
        awarded_count = sum(1 for t in tenders if t.status == 'awarded')

        return jsonify({
            "count": len(tenders),
            "summary": {
                "launched": launched_count,
                "awarded": awarded_count
            },
            "data": [t.to_dict() for t in tenders]
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/gls/all ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/supply-pipeline", methods=["GET"])
def get_supply_pipeline():
    """
    Get aggregate upcoming supply pipeline.

    Query params:
        - market_segment: CCR, RCR, or OCR (optional)

    Returns:
        Aggregated SIGNAL data by region
    """
    start = time.time()

    market_segment = request.args.get("market_segment")

    try:
        from services.gls_scraper import get_supply_pipeline

        pipeline = get_supply_pipeline(market_segment=market_segment)

        elapsed = time.time() - start
        print(f"GET /api/gls/supply-pipeline took: {elapsed:.4f} seconds")

        return jsonify(pipeline)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/gls/supply-pipeline ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/price-floor", methods=["GET"])
def get_price_floor():
    """
    Get aggregate awarded price floor data.

    Query params:
        - market_segment: CCR, RCR, or OCR (optional)

    Returns:
        Aggregated FACT data with psf_ppr statistics
    """
    start = time.time()

    market_segment = request.args.get("market_segment")

    try:
        from services.gls_scraper import get_price_floor

        price_floor = get_price_floor(market_segment=market_segment)

        elapsed = time.time() - start
        print(f"GET /api/gls/price-floor took: {elapsed:.4f} seconds")

        return jsonify(price_floor)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/gls/price-floor ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/tender/<release_id>", methods=["GET"])
def get_tender_detail(release_id: str):
    """
    Get details for a specific tender by release ID.

    Args:
        release_id: URA release ID (e.g., 'pr25-66')

    Returns:
        Full tender details
    """
    start = time.time()

    try:
        tender = db.session.query(GLSTender).filter(
            GLSTender.release_id == release_id.lower()
        ).first()

        if not tender:
            return jsonify({"error": f"Tender not found: {release_id}"}), 404

        elapsed = time.time() - start
        print(f"GET /api/gls/tender/{release_id} took: {elapsed:.4f} seconds")

        return jsonify(tender.to_dict())

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/gls/tender/{release_id} ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/needs-review", methods=["GET"])
def get_needs_review():
    """
    Get tenders that need manual review.

    Returns:
        List of tenders flagged for review
    """
    start = time.time()

    try:
        tenders = db.session.query(GLSTender).filter(
            GLSTender.needs_review == True
        ).order_by(desc(GLSTender.release_date)).all()

        elapsed = time.time() - start
        print(f"GET /api/gls/needs-review took: {elapsed:.4f} seconds (returned {len(tenders)} tenders)")

        return jsonify({
            "count": len(tenders),
            "data": [t.to_dict() for t in tenders]
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/gls/needs-review ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/scrape", methods=["POST"])
def trigger_scrape():
    """
    Trigger a GLS scrape (admin endpoint).

    Query params:
        - year: Year to scrape (default: 2025)
        - dry_run: If 'true', don't save to database

    Returns:
        Scrape statistics
    """
    start = time.time()

    year = int(request.args.get("year", 2025))
    dry_run = request.args.get("dry_run", "").lower() == "true"

    try:
        from services.gls_scraper import scrape_gls_tenders

        stats = scrape_gls_tenders(year=year, dry_run=dry_run)

        elapsed = time.time() - start
        print(f"POST /api/gls/scrape took: {elapsed:.4f} seconds")

        return jsonify({
            "success": True,
            "year": year,
            "dry_run": dry_run,
            "elapsed_seconds": round(elapsed, 2),
            "statistics": stats
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"POST /api/gls/scrape ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/reset", methods=["POST"])
def reset_and_rescrape():
    """
    Reset GLS data and rescrape from URA.

    Query params:
        - year: Year to scrape (default: 2025)
        - confirm: Must be 'yes' to proceed

    Returns:
        Scrape statistics after reset
    """
    import os
    start = time.time()

    year = int(request.args.get("year", 2025))
    confirm = request.args.get("confirm", "").lower()

    if confirm != "yes":
        return jsonify({
            "error": "Must pass confirm=yes to reset all GLS data",
            "warning": "This will DELETE all existing GLS tender records"
        }), 400

    try:
        from models.gls_tender import GLSTender
        from services.gls_scraper import scrape_gls_tenders
        from sqlalchemy import text, create_engine
        from sqlalchemy.orm import scoped_session, sessionmaker

        # Create a FRESH database connection to avoid SSL stale connection issues
        # This is critical on Render where connections can go stale
        database_url = os.environ.get('DATABASE_URL', '')

        if database_url:
            # Fix Render's postgres:// to postgresql://
            if database_url.startswith('postgres://'):
                database_url = database_url.replace('postgres://', 'postgresql://', 1)

            # Create fresh engine with SSL settings
            engine = create_engine(
                database_url,
                pool_pre_ping=True,
                pool_recycle=300,
                connect_args={"sslmode": "require"} if 'render.com' in database_url or 'neon' in database_url else {}
            )

            # Create a new session for this operation
            Session = scoped_session(sessionmaker(bind=engine))
            db_session = Session()

            try:
                # DROP the table entirely to fix schema issues
                print("Dropping gls_tenders table to reset schema...")
                db_session.execute(text("DROP TABLE IF EXISTS gls_tenders CASCADE"))
                db_session.commit()

                # Recreate the table with the correct schema
                print("Recreating gls_tenders table with updated schema...")
                GLSTender.__table__.create(engine, checkfirst=True)

                # Rescrape with fresh session
                stats = scrape_gls_tenders(year=year, db_session=db_session, dry_run=False)

                elapsed = time.time() - start
                print(f"POST /api/gls/reset took: {elapsed:.4f} seconds")

                return jsonify({
                    "success": True,
                    "year": year,
                    "table_recreated": True,
                    "elapsed_seconds": round(elapsed, 2),
                    "statistics": stats
                })
            finally:
                db_session.close()
                Session.remove()
                engine.dispose()
        else:
            # Fallback: use app's db session (local dev without DATABASE_URL)
            print("Dropping gls_tenders table to reset schema...")
            db.session.execute(text("DROP TABLE IF EXISTS gls_tenders CASCADE"))
            db.session.commit()

            print("Recreating gls_tenders table with updated schema...")
            GLSTender.__table__.create(db.engine, checkfirst=True)

            stats = scrape_gls_tenders(year=year, dry_run=False)

            elapsed = time.time() - start
            print(f"POST /api/gls/reset took: {elapsed:.4f} seconds")

            return jsonify({
                "success": True,
                "year": year,
                "table_recreated": True,
                "elapsed_seconds": round(elapsed, 2),
                "statistics": stats
            })

    except Exception as e:
        elapsed = time.time() - start
        print(f"POST /api/gls/reset ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/cron-refresh", methods=["POST"])
def cron_refresh():
    """
    Cron job endpoint for scheduled GLS data refresh.

    This endpoint is designed to be called by Render cron jobs or external schedulers.
    It performs a full refresh: drop table, recreate, and re-scrape.

    Query params:
        - year: Year to scrape (default: 2025)
        - secret: Optional secret key for security (set GLS_CRON_SECRET env var)

    Returns:
        Scrape statistics
    """
    import os
    start = time.time()

    year = int(request.args.get("year", 2025))
    secret = request.args.get("secret", "")

    # Optional security check - if GLS_CRON_SECRET is set, require it
    expected_secret = os.environ.get("GLS_CRON_SECRET", "")
    if expected_secret and secret != expected_secret:
        return jsonify({"error": "Invalid secret"}), 403

    try:
        from services.gls_scheduler import cron_refresh as do_cron_refresh

        result = do_cron_refresh(year=year)

        elapsed = time.time() - start
        print(f"POST /api/gls/cron-refresh took: {elapsed:.4f} seconds")

        result["elapsed_seconds"] = round(elapsed, 2)
        return jsonify(result)

    except Exception as e:
        elapsed = time.time() - start
        print(f"POST /api/gls/cron-refresh ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/refresh-status", methods=["GET"])
def get_refresh_status():
    """
    Get the status of GLS data and any ongoing refresh.

    Returns:
        Status information including last scrape time and whether refresh is in progress
    """
    try:
        from services.gls_scheduler import get_scrape_status, is_data_stale, has_bad_data

        status = get_scrape_status()
        status["data_stale"] = is_data_stale(max_age_hours=24)
        status["has_bad_data"] = has_bad_data()

        # Get counts from database
        launched_count = db.session.query(GLSTender).filter(GLSTender.status == 'launched').count()
        awarded_count = db.session.query(GLSTender).filter(GLSTender.status == 'awarded').count()

        status["counts"] = {
            "launched": launched_count,
            "awarded": awarded_count,
            "total": launched_count + awarded_count
        }

        return jsonify(status)

    except Exception as e:
        print(f"GET /api/gls/refresh-status ERROR: {e}")
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/trigger-refresh", methods=["POST"])
def trigger_background_refresh():
    """
    Trigger a background refresh of GLS data.

    This endpoint starts the scrape in a background thread and returns immediately.
    Use /refresh-status to check progress.

    Query params:
        - year: Year to scrape (default: 2025)
        - force: If 'true', force reset even if data looks fresh

    Returns:
        Whether refresh was started
    """
    start = time.time()

    year = int(request.args.get("year", 2025))
    force = request.args.get("force", "").lower() == "true"

    try:
        from services.gls_scheduler import run_background_scrape, is_data_stale, has_bad_data

        # Check if refresh is actually needed (unless forced)
        needs_refresh = force or is_data_stale(max_age_hours=24) or has_bad_data()

        if not needs_refresh:
            return jsonify({
                "started": False,
                "reason": "Data is fresh and valid. Use force=true to override."
            })

        # Start background scrape
        started = run_background_scrape(year=year, force_reset=True)

        elapsed = time.time() - start
        print(f"POST /api/gls/trigger-refresh took: {elapsed:.4f} seconds (started={started})")

        return jsonify({
            "started": started,
            "message": "Background refresh started" if started else "Refresh already in progress"
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"POST /api/gls/trigger-refresh ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@gls_bp.route("/stats", methods=["GET"])
def get_stats():
    """
    Get summary statistics for GLS data.

    Returns:
        Overview of tender counts and values
    """
    start = time.time()

    try:
        from sqlalchemy import func

        # Count by status
        status_counts = db.session.query(
            GLSTender.status,
            func.count(GLSTender.id).label('count')
        ).group_by(GLSTender.status).all()

        status_summary = {row.status: row.count for row in status_counts}

        # Count by region
        region_counts = db.session.query(
            GLSTender.market_segment,
            GLSTender.status,
            func.count(GLSTender.id).label('count'),
            func.sum(GLSTender.estimated_units).label('total_units')
        ).group_by(GLSTender.market_segment, GLSTender.status).all()

        by_region = {}
        for row in region_counts:
            region = row.market_segment or 'Unknown'
            if region not in by_region:
                by_region[region] = {'launched': 0, 'awarded': 0, 'units_launched': 0, 'units_awarded': 0}

            by_region[region][row.status] = row.count
            by_region[region][f'units_{row.status}'] = int(row.total_units) if row.total_units else 0

        # Date range
        date_range = db.session.query(
            func.min(GLSTender.release_date).label('earliest'),
            func.max(GLSTender.release_date).label('latest')
        ).first()

        elapsed = time.time() - start
        print(f"GET /api/gls/stats took: {elapsed:.4f} seconds")

        return jsonify({
            "status_summary": status_summary,
            "by_region": by_region,
            "date_range": {
                "earliest": date_range.earliest.isoformat() if date_range.earliest else None,
                "latest": date_range.latest.isoformat() if date_range.latest else None
            },
            "total_tenders": sum(status_summary.values())
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/gls/stats ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500
