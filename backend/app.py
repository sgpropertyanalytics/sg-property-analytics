"""
Flask Application Factory - SQL-Only Analytics Architecture

All analytics use SQL aggregation for memory efficiency.
No in-memory DataFrames - safe for resource-constrained hosting (Render 512MB).

SaaS Features:
- User authentication (Firebase-only, Bearer token per-request)
- Ad serving and tracking
- Analytics API remains public (no authentication required)
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import os
from config import Config
from models.database import db
from flask_migrate import Migrate

# Initialize Flask-Migrate (will be initialized in create_app)
migrate = Migrate()


def _run_startup_validation():
    """
    Run READ-ONLY data validation report on startup.

    IMPORTANT: App startup must NOT mutate the database.
    - No DELETE, UPDATE, or INSERT operations on transactions table
    - Outlier filtering happens ONCE during upload pipeline (staging), not here
    - This ensures deterministic, reproducible datasets

    This function only REPORTS potential issues for logging/monitoring.
    """
    from sqlalchemy import text

    try:
        # Use raw SQL to avoid ORM schema mismatch errors
        result = db.session.execute(text("SELECT COUNT(*) FROM transactions"))
        count = result.scalar()

        if count == 0:
            return  # No data to validate

        # Try to run validation report (may fail if schema is outdated)
        from services.data_validation import run_validation_report
        report = run_validation_report()

        # Log the report (informational only)
        if report['is_clean']:
            print(f"   ✓ Data validation: {report['total_count']:,} records, all clean")
        else:
            issues = report['potential_issues']
            print(f"   ℹ️  Data validation report ({report['total_count']:,} records):")
            if issues['invalid_records'] > 0:
                print(f"      - Invalid records: {issues['invalid_records']:,}")
            if issues['potential_duplicates'] > 0:
                print(f"      - Potential duplicates: {issues['potential_duplicates']:,}")
            if issues['potential_outliers'] > 0:
                print(f"      - Potential outliers: {issues['potential_outliers']:,}")
            print(f"      Note: Run upload script to clean data if needed")

    except Exception as e:
        print(f"\n⚠️  Validation report skipped: {e}")
        # Don't fail startup if validation fails


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    is_test = os.getenv("PYTEST_CURRENT_TEST") is not None

    # Initialize CORS
    # Note: Flask-CORS handles all CORS headers automatically, no after_request needed
    # Firebase-only auth uses Bearer tokens (no cookies), so credentials are not needed
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",  # Vite default port
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173",  # Vite default port
        "https://sg-property-analyzer.vercel.app",
        "https://www.sgpropertyanalytics.com",
        "https://sgpropertyanalytics.com",
    ]
    CORS(app,
         resources={r"/api/*": {"origins": allowed_origins}},
         methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
         allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
         expose_headers=["X-Request-ID", "X-DB-Time-Ms", "X-Query-Count"])

    # Security headers (HSTS, CSP, etc.)
    if Config.SECURITY_HEADERS_ENABLED:
        from flask_talisman import Talisman

        Talisman(
            app,
            force_https=Config.SECURITY_HEADERS_FORCE_HTTPS and not is_test,
            strict_transport_security=True,
            strict_transport_security_max_age=Config.SECURITY_HEADERS_HSTS_MAX_AGE,
            strict_transport_security_include_subdomains=Config.SECURITY_HEADERS_HSTS_INCLUDE_SUBDOMAINS,
            strict_transport_security_preload=Config.SECURITY_HEADERS_HSTS_PRELOAD,
            frame_options=Config.SECURITY_HEADERS_FRAME_OPTIONS,
            x_content_type_options=True,
            referrer_policy=Config.SECURITY_HEADERS_REFERRER_POLICY,
            permissions_policy=Config.SECURITY_HEADERS_PERMISSIONS_POLICY,
            content_security_policy=Config.SECURITY_HEADERS_CSP,
            content_security_policy_report_only=Config.SECURITY_HEADERS_REPORT_ONLY,
            content_security_policy_report_uri=Config.SECURITY_HEADERS_CSP_REPORT_URI,
        )

    # === API CONTRACT MIDDLEWARE ===
    # Request ID injection for request correlation and debugging
    from api.middleware import setup_request_id_middleware
    setup_request_id_middleware(app)

    # Query timing instrumentation (production-safe, no EXPLAIN)
    from api.middleware import setup_query_timing_middleware
    setup_query_timing_middleware(app)

    # Request usage logging (sampling + watchlist)
    from api.middleware import setup_request_logging_middleware
    setup_request_logging_middleware(app)

    @app.route("/api/csp-report", methods=["POST"])
    def csp_report():
        """
        CSP report endpoint for report-only or enforced policies.

        Logs payloads for observability and returns 204.
        """
        payload = request.get_json(silent=True) or {}
        app.logger.warning("CSP violation reported: %s", payload)
        return ("", 204)

    # Load contract schemas (registers contracts on import)
    try:
        from api.contracts import schemas  # noqa: F401
        print("   ✓ API contracts loaded")
    except ImportError as e:
        print(f"   ⚠️  API contracts not loaded: {e}")

    # Global error handlers to ensure CORS headers are present on error responses
    from werkzeug.exceptions import HTTPException

    def _add_cors_headers_to_response(response):
        """
        Add CORS headers for error responses (Flask-CORS may miss these).
        """
        # Only add if not already present (Flask-CORS may have added them)
        if 'Access-Control-Allow-Origin' in response.headers:
            return

        # Get request origin and check if it's allowed
        origin = request.headers.get('Origin')
        if origin and origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Request-ID'
        # If origin not in allowed list, don't add CORS headers (request will fail CORS check)

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        """
        Handle HTTP exceptions (404, 405, etc.) - preserve their status codes.
        DO NOT convert these to 500.
        """
        from flask import g

        # Get request ID for correlation
        request_id = getattr(g, 'request_id', None)

        # Standardized error envelope
        response = jsonify({
            "error": {
                "code": error.name.upper().replace(' ', '_'),
                "message": error.description,
                "requestId": request_id,
            }
        })
        response.status_code = error.code

        # Add request ID to response headers
        if request_id:
            response.headers['X-Request-ID'] = request_id

        _add_cors_headers_to_response(response)
        return response

    @app.errorhandler(Exception)
    def handle_exception(error):
        """
        Handle non-HTTP exceptions (real 500s) - actual internal errors.
        """
        from flask import g

        # Log the error for debugging
        import traceback
        traceback.print_exc()

        # Check if it's an HTTPException that somehow got here (shouldn't happen, but be safe)
        if isinstance(error, HTTPException):
            return handle_http_exception(error)

        # Get request ID for correlation
        request_id = getattr(g, 'request_id', None)

        # Standardized error envelope
        response = jsonify({
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "requestId": request_id,
            }
        })
        response.status_code = 500

        # Add request ID to response headers
        if request_id:
            response.headers['X-Request-ID'] = request_id

        _add_cors_headers_to_response(response)
        return response

    # Ensure CORS headers are present on ALL responses (including errors from routes)
    @app.after_request
    def add_cors_headers(response):
        from flask import g

        _add_cors_headers_to_response(response)

        # Ensure X-Request-ID is in response (for correlation)
        if 'X-Request-ID' not in response.headers:
            request_id = getattr(g, 'request_id', None)
            if request_id:
                response.headers['X-Request-ID'] = request_id

        return response

    # SECURITY: Prevent caching of tier-sensitive API responses
    # This prevents premium data from being cached and served to free users
    @app.after_request
    def add_cache_control(response):
        # List of endpoints that vary by subscription tier
        tier_sensitive_paths = [
            '/api/transactions',
            '/api/dashboard',
            '/api/scatter-sample',
            '/api/projects/hot',
            '/api/insights/',
            '/api/deal-checker/',
            '/api/comparable_value_analysis',
        ]

        # Check if current path is tier-sensitive
        path = request.path
        is_tier_sensitive = any(path.startswith(p) for p in tier_sensitive_paths)

        if is_tier_sensitive:
            # Prevent any caching of tier-sensitive responses
            response.headers['Cache-Control'] = 'private, no-store, no-cache, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
            # Vary header ensures different responses for different auth states
            response.headers['Vary'] = 'Authorization'

        return response

    # Initialize SQLAlchemy
    db.init_app(app)

    # Initialize Flask-Migrate for database migrations
    migrate.init_app(app, db)

    # Initialize rate limiter for URA compliance (prevents bulk data extraction)
    from utils.rate_limiter import init_limiter
    limiter = init_limiter(app)
    app.limiter = limiter  # Store for route access
    print("   ✓ Rate limiter initialized")

    # Create database tables and run auto-validation
    with app.app_context():
        # Import all models before create_all to ensure tables are created
        from models.transaction import Transaction
        from models.gls_tender import GLSTender
        from models.upcoming_launch import UpcomingLaunch
        from models.popular_school import PopularSchool
        from models.project_location import ProjectLocation
        # Note: ProjectInventory removed - total_units now in static JSON file

        env = (os.environ.get("ENV") or os.environ.get("FLASK_ENV") or os.environ.get("APP_ENV") or "").lower()
        is_prod = env in {"prod", "production"}
        allow_create = app.config.get("TESTING") or not is_prod
        if allow_create:
            db.create_all()
            print("✓ Database initialized - using SQL-only aggregation for memory efficiency")
        else:
            print("✓ Database ready (schema creation disabled in non-dev environments)")

        # Print database connection info for verification
        try:
            from sqlalchemy import text
            db_info = db.session.execute(text(
                "SELECT current_database(), inet_server_addr(), inet_server_port()"
            )).fetchone()
            print(f"   Database: {db_info[0]} @ {db_info[1] or 'localhost'}:{db_info[2] or 5432}")
        except Exception:
            pass  # Non-critical diagnostic

        # === STARTUP VALIDATION CHECKS ===
        # Gate behind RUN_STARTUP_CHECKS env var (default: off in production)
        # Set RUN_STARTUP_CHECKS=1 in staging/dev for schema/data validation
        # In production, these checks add startup time and can cause timeouts
        run_checks = os.getenv('RUN_STARTUP_CHECKS', '').lower() in ('1', 'true', 'yes')

        if run_checks:
            print("   🔍 Running startup checks (RUN_STARTUP_CHECKS=1)...")

            # === SCHEMA CHECK: Fail fast if critical columns are missing ===
            try:
                from services.schema_check import run_schema_check
                schema_report = run_schema_check()

                if not schema_report['is_valid']:
                    print("\n" + "=" * 60)
                    print("FATAL: SCHEMA DRIFT DETECTED")
                    print("=" * 60)

                    # Show missing tables
                    if schema_report['missing_tables']:
                        print(f"\nMissing tables: {', '.join(schema_report['missing_tables'])}")

                    # Show missing critical columns
                    critical = [c for c in schema_report['missing_columns'] if c['severity'] == 'critical']
                    if critical:
                        print(f"\nMissing critical columns:")
                        for col in critical:
                            print(f"   - {col['table']}.{col['column']}")

                    # Show missing optional columns (warnings)
                    warnings = [c for c in schema_report['missing_columns'] if c['severity'] == 'warning']
                    if warnings:
                        print(f"\nMissing optional columns ({len(warnings)} total):")
                        # Show first 5 as examples
                        for col in warnings[:5]:
                            print(f"   - {col['table']}.{col['column']}")
                        if len(warnings) > 5:
                            print(f"   ... and {len(warnings) - 5} more")

                    print("\n" + "-" * 60)
                    print("TO FIX: Run migrations before starting the app:")
                    print("   psql \"$DATABASE_URL\" -f backend/migrations/001_add_all_missing_columns.sql")
                    print("-" * 60 + "\n")

                    # HARD FAIL: Don't serve broken APIs
                    # This prevents silent 500 errors from missing columns
                    raise RuntimeError(
                        f"Schema drift: {len(schema_report['missing_tables'])} missing tables, "
                        f"{len(critical)} missing critical columns. "
                        "Run migrations before starting the app."
                    )
                else:
                    print("   ✓ Schema check passed")
            except RuntimeError:
                # Re-raise schema errors (don't catch our own RuntimeError)
                raise
            except Exception as e:
                # Other errors (e.g., can't connect to check schema) - warn but continue
                print(f"   ⚠️  Schema check skipped: {e}")

            # Auto-validate data on startup (READ-ONLY, ~100ms)
            # This runs inside create_app() so it works with gunicorn
            _run_startup_validation()
        else:
            print("   ⏭️  Startup checks disabled (set RUN_STARTUP_CHECKS=1 to enable)")

        # =======================================================================
        # REMOVED FROM WEB BOOT (2024-01 optimization)
        # =======================================================================
        # The following were removed because they are USELESS on Render:
        #
        # 1. check_and_refresh_on_startup() - GLS freshness check
        #    Problem: Can spawn background scrape threads, competing with requests
        #    Solution: Move to dedicated cron job
        #
        # 2. warm_cache_for_common_queries() / warm_kpi_cache()
        #    Problem: Cache is IN-MEMORY (TTLCache). Render instances sleep after
        #    15 min idle, wiping all cache. Warming takes 20-40s for ZERO benefit.
        #    Solution: Migrate to DB-backed cache (materialized views or cache table)
        #    TODO: Implement persistent caching strategy
        #
        # 3. data_guard subprocess
        #    Problem: Spawns separate Python process, adds 1-5s and memory spike
        #    Solution: Run in CI/CD pipeline or dedicated cron job
        # =======================================================================

        # Firebase Admin SDK pre-initialization (~200ms, non-blocking)
        # This prevents 502 timeouts on cold starts by initializing Firebase
        # during app startup instead of on first /auth/firebase-sync request
        try:
            from routes.auth import get_firebase_app
            firebase_app = get_firebase_app()
            if firebase_app:
                print("   ✓ Firebase Admin SDK initialized")
            else:
                print("   ℹ️  Firebase Admin SDK not configured")
        except Exception as e:
            print(f"   ⚠️  Firebase pre-init skipped: {e}")

        # Checksum verification (~500ms): Detect tampering of tracked CSV files
        # Gated behind RUN_STARTUP_CHECKS (adds startup time, better in cron job)
        if run_checks:
            try:
                from utils.data_checksums import verify_all
                violations = verify_all()
                if violations:
                    print("   ⚠️  DATA INTEGRITY VIOLATIONS:")
                    for v in violations:
                        print(f"      - {v}")
                    print("      Run: python -c \"from utils.data_checksums import save_checksums; save_checksums()\"")
                else:
                    print("   ✓ Data checksum verification passed")
            except Exception as e:
                print(f"   ⚠️  Checksum verification skipped: {e}")

    # Register routes
    # Analytics routes (PUBLIC - no authentication required)
    from routes.analytics import analytics_bp
    app.register_blueprint(analytics_bp, url_prefix='/api')

    # Auth routes (Firebase-only authentication)
    from routes.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

    # Payment routes (Stripe integration)
    from routes.payments import payments_bp
    app.register_blueprint(payments_bp, url_prefix='/api/payments')

    # GLS (Government Land Sales) routes
    from routes.gls import gls_bp
    app.register_blueprint(gls_bp, url_prefix='/api/gls')

    # Upcoming Launches (pre-launch condo projects) routes
    from routes.upcoming_launches import upcoming_launches_bp
    app.register_blueprint(upcoming_launches_bp, url_prefix='/api/upcoming-launches')

    # Projects routes (school proximity, geocoding)
    from routes.projects import projects_bp
    app.register_blueprint(projects_bp, url_prefix='/api')

    # Deal Checker routes (nearby transactions, price comparison)
    from routes.deal_checker import deal_checker_bp
    app.register_blueprint(deal_checker_bp, url_prefix='/api')

    # Insights routes (Visual Analytics Map, market intelligence)
    from routes.insights import insights_bp
    app.register_blueprint(insights_bp, url_prefix='/api/insights')

    # AI routes (Chart interpretation - Premium feature)
    from routes.ai import ai_bp
    app.register_blueprint(ai_bp, url_prefix='/api/ai')
    print("   ✓ AI routes registered")

    # Supply Pipeline routes (waterfall chart data)
    try:
        from routes.supply import supply_bp
        app.register_blueprint(supply_bp, url_prefix='/api/supply')
        print("   ✓ Supply routes registered")
    except Exception as e:
        print(f"   ⚠️ Failed to register supply routes: {e}")
        import traceback
        traceback.print_exc()

    # Note: Verification is handled by backend/scripts/verify_units.py (one-off CLI)
    # No API routes needed - run: python scripts/verify_units.py --project "PROJECT" --dry-run

    # Serve dashboard.html at root
    @app.route("/", methods=["GET"])
    def index():
        dashboard_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dashboard.html')
        if os.path.exists(dashboard_path):
            with open(dashboard_path, 'r') as f:
                return f.read()

        from models.transaction import Transaction
        from services.analytics_reader import get_reader

        try:
            count = db.session.query(Transaction).count()
            metadata = get_reader().get_metadata()
            return jsonify({
                "name": "Singapore Condo Resale Statistics API",
                "status": "running",
                "data_loaded": count > 0,
                "row_count": count,
                "stats_computed": metadata.get("last_updated") is not None,
                "last_updated": metadata.get("last_updated")
            })
        except Exception as e:
            return jsonify({
                "name": "Singapore Condo Resale Statistics API",
                "status": "error",
                "error": str(e)
            })

    return app


def run_app():
    """Main entry point for local development - starts server with Flask's dev server."""
    print("=" * 60)
    print("Starting Flask API - SQL-Only Analytics Architecture")
    print("=" * 60)

    # Create app (validation runs inside create_app)
    app = create_app()

    with app.app_context():
        from models.transaction import Transaction
        from services.analytics_reader import get_reader

        count = db.session.query(Transaction).count()
        metadata = get_reader().get_metadata()

        print(f"\n📊 Database Status:")
        print(f"   Transactions: {count:,}")
        if metadata.get("outliers_excluded", 0) > 0:
            print(f"   Outliers excluded: {metadata.get('outliers_excluded'):,}")
        if metadata.get("last_updated"):
            print(f"   Stats last computed: {metadata.get('last_updated')}")
            print(f"   ✓ Pre-computed analytics ready")
        else:
            print(f"   ⚠️  No pre-computed stats found")
            print(f"   Run: python scripts/upload.py to load data and compute stats")

    print("=" * 60)
    port = int(os.getenv("PORT", 5000))
    app.run(debug=True, host="0.0.0.0", port=port)


if __name__ == "__main__":
    run_app()

# Module-level app instance for gunicorn: `gunicorn app:app`
# This is the standard Flask deployment pattern
app = create_app()
