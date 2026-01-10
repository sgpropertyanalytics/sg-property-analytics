"""
GLS (Government Land Sales) API Routes

Active public endpoint:
- /all - Unified GLS feed (use filters on /all)

Admin endpoints:
- /needs-review
- /scrape
- /reset
- /cron-refresh
- /refresh-status
- /trigger-refresh
"""
from flask import Blueprint, request, jsonify, g
import time
import os
from functools import wraps
from models.database import db
from models.gls_tender import GLSTender
from sqlalchemy import desc, asc, extract
from utils.normalize import to_int
from api.contracts import api_contract
from config import Config

gls_bp = Blueprint('gls', __name__)

# Import contract versioning for HTTP header
from api.contracts.contract_schema import API_CONTRACT_HEADER, CURRENT_API_CONTRACT_VERSION


@gls_bp.after_request
def add_contract_version_header(response):
    """Add X-API-Contract-Version header to all GLS responses."""
    response.headers[API_CONTRACT_HEADER] = CURRENT_API_CONTRACT_VERSION
    return response


# Minimum year for frontend display (2024 data used only for backend linking)
MIN_DISPLAY_YEAR = 2025


def require_gls_admin_secret(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        expected = os.getenv("ADMIN_API_SECRET") or os.getenv("GLS_CRON_SECRET", "")
        if not expected:
            if Config.DEBUG:
                return fn(*args, **kwargs)
            return jsonify({"error": "Admin secret not configured"}), 503

        provided = request.headers.get("X-Admin-Secret", "")
        if provided != expected:
            return jsonify({"error": "Forbidden"}), 403

        return fn(*args, **kwargs)

    return wrapper


# --- Public endpoints ---
@gls_bp.route("/all", methods=["GET"])
@api_contract("gls/all")
def get_all():
    """
    Get all GLS tenders (both launched and awarded).

    Query params (normalized by Pydantic via @api_contract):
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

    # Use normalized params from Pydantic (via @api_contract decorator)
    params = g.normalized_params
    market_segment = params.get("market_segment")
    status = params.get("status")
    planning_area = params.get("planning_area")
    limit = params.get("limit", 100)
    sort_by = params.get("sort", "release_date")
    order = params.get("order", "desc")

    try:
        # Only show 2025+ records (2024 used for backend linking only)
        query = db.session.query(GLSTender).filter(
            extract('year', GLSTender.release_date) >= MIN_DISPLAY_YEAR
        )

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
        return jsonify({"error": "Internal server error"}), 500


# --- Admin endpoints ---
@gls_bp.route("/needs-review", methods=["GET"])
@api_contract("gls/needs-review")
@require_gls_admin_secret
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
        return jsonify({"error": "Internal server error"}), 500


@gls_bp.route("/scrape", methods=["POST"])
@require_gls_admin_secret
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

    year = to_int(request.args.get("year"), default=2025, field="year")
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
        return jsonify({"error": "Internal server error"}), 500


@gls_bp.route("/reset", methods=["POST"])
@require_gls_admin_secret
def reset_and_rescrape():
    """
    Reset GLS data and rescrape from URA.

    Query params:
        - year: Year to scrape (default: 2025)
        - confirm: Must be 'yes' to proceed

    Returns:
        Scrape statistics after reset
    """
    start = time.time()

    year = to_int(request.args.get("year"), default=2025, field="year")
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
        from config import get_database_url
        try:
            database_url = get_database_url()  # Handles postgres://, adds SSL to URL
        except RuntimeError:
            database_url = None

        if database_url:
            engine = create_engine(
                database_url,
                pool_pre_ping=True,
                pool_recycle=300
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
        return jsonify({"error": "Internal server error"}), 500


@gls_bp.route("/cron-refresh", methods=["POST"])
@require_gls_admin_secret
def cron_refresh():
    """
    Cron job endpoint for scheduled GLS data refresh.

    This endpoint is designed to be called by Render cron jobs or external schedulers.
    It performs a full refresh: drop table, recreate, and re-scrape.

    Query params:
        - year: Year to scrape (default: 2025)

    Returns:
        Scrape statistics
    """
    start = time.time()

    year = to_int(request.args.get("year"), default=2025, field="year")

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
        return jsonify({"error": "Internal server error"}), 500


@gls_bp.route("/refresh-status", methods=["GET"])
@require_gls_admin_secret
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
        return jsonify({"error": "Internal server error"}), 500


@gls_bp.route("/trigger-refresh", methods=["POST"])
@require_gls_admin_secret
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

    year = to_int(request.args.get("year"), default=2025, field="year")
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
        return jsonify({"error": "Internal server error"}), 500
