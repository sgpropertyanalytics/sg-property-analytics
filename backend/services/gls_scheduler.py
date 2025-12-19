"""
GLS Scheduler Service

Handles background scraping and scheduled updates for GLS data.
Ensures data stays fresh without blocking web requests.
"""
import threading
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import os

# Global state for tracking background jobs
_scrape_lock = threading.Lock()
_scrape_in_progress = False
_last_scrape_time: Optional[datetime] = None
_last_scrape_result: Optional[Dict[str, Any]] = None


def get_scrape_status() -> Dict[str, Any]:
    """Get current scrape status."""
    global _scrape_in_progress, _last_scrape_time, _last_scrape_result

    return {
        "in_progress": _scrape_in_progress,
        "last_scrape_time": _last_scrape_time.isoformat() if _last_scrape_time else None,
        "last_scrape_result": _last_scrape_result
    }


def is_data_stale(max_age_hours: int = 24) -> bool:
    """
    Check if GLS data is stale and needs refresh.

    Args:
        max_age_hours: Maximum age in hours before data is considered stale

    Returns:
        True if data needs refresh
    """
    from models.database import db
    from models.gls_tender import GLSTender
    from sqlalchemy import func

    try:
        # Check if we have any data at all
        count = db.session.query(func.count(GLSTender.id)).scalar()
        if count == 0:
            print("GLS data check: No data exists, needs refresh")
            return True

        # Check the most recent scrape time from created_at
        latest = db.session.query(func.max(GLSTender.created_at)).scalar()
        if not latest:
            print("GLS data check: No created_at timestamp, needs refresh")
            return True

        age = datetime.utcnow() - latest
        is_stale = age > timedelta(hours=max_age_hours)

        print(f"GLS data check: {count} records, latest from {latest}, age={age}, stale={is_stale}")
        return is_stale

    except Exception as e:
        print(f"GLS data check error: {e}")
        # If we can't check, assume we need refresh
        return True


def has_bad_data() -> bool:
    """
    Check if database has obviously bad data that needs re-scraping.

    Returns:
        True if data quality issues detected
    """
    from models.database import db
    from models.gls_tender import GLSTender

    try:
        # Check for bad location patterns
        bad_locations = db.session.query(GLSTender).filter(
            db.or_(
                GLSTender.location_raw.ilike('and %'),
                GLSTender.location_raw.ilike('the %'),
                GLSTender.location_raw.ilike('while %'),
                GLSTender.location_raw.ilike('%are zoned%'),
                GLSTender.location_raw.ilike('%can yield%'),
                GLSTender.location_raw.ilike('%launched%'),
            )
        ).count()

        if bad_locations > 0:
            print(f"GLS data quality: Found {bad_locations} records with bad location names")
            return True

        # Check for unrealistic unit counts (> 5000)
        bad_units = db.session.query(GLSTender).filter(
            GLSTender.estimated_units > 5000
        ).count()

        if bad_units > 0:
            print(f"GLS data quality: Found {bad_units} records with unrealistic unit counts")
            return True

        return False

    except Exception as e:
        print(f"GLS data quality check error: {e}")
        return False


def run_background_scrape(year: int = 2025, force_reset: bool = False, app=None) -> bool:
    """
    Run GLS scrape in background thread.

    Args:
        year: Year to scrape
        force_reset: If True, drop and recreate table
        app: Flask app instance (will try to get from current_app if not provided)

    Returns:
        True if scrape was started, False if already in progress
    """
    global _scrape_in_progress, _scrape_lock

    with _scrape_lock:
        if _scrape_in_progress:
            print("GLS scrape already in progress, skipping")
            return False
        _scrape_in_progress = True

    # Get app reference for thread
    if app is None:
        try:
            from flask import current_app
            app = current_app._get_current_object()
        except RuntimeError:
            print("Error: No Flask app context available for background scrape")
            with _scrape_lock:
                _scrape_in_progress = False
            return False

    def _do_scrape(flask_app):
        global _scrape_in_progress, _last_scrape_time, _last_scrape_result

        try:
            from models.gls_tender import GLSTender
            from services.gls_scraper import scrape_gls_tenders
            from sqlalchemy import text, create_engine
            from sqlalchemy.orm import scoped_session, sessionmaker
            import os

            print(f"Starting background GLS scrape for {year}...")

            # Need app context for database operations
            with flask_app.app_context():
                # Create a NEW database engine for this thread to avoid SSL issues
                # Background threads can't share SSL connections with main thread
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

                    # Create a new session for this thread
                    Session = scoped_session(sessionmaker(bind=engine))
                    db_session = Session()

                    try:
                        if force_reset:
                            print("Force reset: Dropping gls_tenders table...")
                            db_session.execute(text("DROP TABLE IF EXISTS gls_tenders CASCADE"))
                            db_session.commit()

                            print("Recreating gls_tenders table...")
                            GLSTender.__table__.create(engine, checkfirst=True)

                        # Run the scrape with our thread-local session
                        result = scrape_gls_tenders(year=year, db_session=db_session, dry_run=False)

                        _last_scrape_time = datetime.utcnow()
                        _last_scrape_result = result

                        print(f"Background GLS scrape completed: {result}")
                    finally:
                        db_session.close()
                        Session.remove()
                        engine.dispose()
                else:
                    # Fallback: use the app's db session (may fail with SSL)
                    from models.database import db

                    if force_reset:
                        print("Force reset: Dropping gls_tenders table...")
                        db.session.execute(text("DROP TABLE IF EXISTS gls_tenders CASCADE"))
                        db.session.commit()

                        print("Recreating gls_tenders table...")
                        GLSTender.__table__.create(db.engine, checkfirst=True)

                    result = scrape_gls_tenders(year=year, dry_run=False)
                    _last_scrape_time = datetime.utcnow()
                    _last_scrape_result = result
                    print(f"Background GLS scrape completed: {result}")

        except Exception as e:
            print(f"Background GLS scrape error: {e}")
            import traceback
            traceback.print_exc()
            _last_scrape_result = {"error": str(e)}

        finally:
            with _scrape_lock:
                _scrape_in_progress = False

    # Start background thread with app reference
    thread = threading.Thread(target=_do_scrape, args=(app,), daemon=True)
    thread.start()

    return True


def check_and_refresh_on_startup(app):
    """
    Check data freshness on app startup and refresh if needed.
    Called from app.py after database initialization.

    Args:
        app: Flask app instance
    """
    with app.app_context():
        try:
            # First check if data exists and is not stale
            if is_data_stale(max_age_hours=48):  # 48 hours for startup check
                print("GLS startup check: Data is stale or missing, triggering background refresh...")
                run_background_scrape(year=2025, force_reset=True, app=app)
                return

            # Check for bad data quality
            if has_bad_data():
                print("GLS startup check: Bad data detected, triggering background refresh...")
                run_background_scrape(year=2025, force_reset=True, app=app)
                return

            print("GLS startup check: Data is fresh and valid")

        except Exception as e:
            print(f"GLS startup check error: {e}")
            import traceback
            traceback.print_exc()


def cron_refresh(year: int = 2025) -> Dict[str, Any]:
    """
    Endpoint handler for cron job refresh.
    Called by Render cron or external scheduler.

    Args:
        year: Year to scrape

    Returns:
        Status dict
    """
    from models.database import db
    from models.gls_tender import GLSTender
    from services.gls_scraper import scrape_gls_tenders
    from sqlalchemy import text

    try:
        print(f"Cron GLS refresh starting for {year}...")

        # Drop and recreate to ensure clean data
        print("Dropping gls_tenders table for fresh scrape...")
        db.session.execute(text("DROP TABLE IF EXISTS gls_tenders CASCADE"))
        db.session.commit()

        print("Recreating gls_tenders table...")
        GLSTender.__table__.create(db.engine, checkfirst=True)

        # Run scrape synchronously (cron has longer timeout)
        result = scrape_gls_tenders(year=year, dry_run=False)

        global _last_scrape_time, _last_scrape_result
        _last_scrape_time = datetime.utcnow()
        _last_scrape_result = result

        print(f"Cron GLS refresh completed: {result}")

        return {
            "success": True,
            "timestamp": _last_scrape_time.isoformat(),
            "statistics": result
        }

    except Exception as e:
        print(f"Cron GLS refresh error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }
