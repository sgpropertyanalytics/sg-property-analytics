"""
Flask Application Factory - SQL-Only Analytics Architecture

All analytics use SQL aggregation for memory efficiency.
No in-memory DataFrames - safe for resource-constrained hosting (Render 512MB).

SaaS Features:
- User authentication (JWT-based)
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

    # Initialize CORS - allow all origins
    # Note: Flask-CORS handles all CORS headers automatically, no after_request needed
    CORS(app,
         resources={r"/api/*": {"origins": "*"}},
         methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
         allow_headers=["Content-Type", "Authorization"],
         supports_credentials=False,
         send_wildcard=True)  # Always send '*' instead of echoing Origin header

    # Global error handlers to ensure CORS headers are present on error responses
    @app.errorhandler(500)
    def handle_500(error):
        response = jsonify({"error": "Internal server error", "details": str(error)})
        response.status_code = 500
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response

    @app.errorhandler(Exception)
    def handle_exception(error):
        # Log the error for debugging
        import traceback
        traceback.print_exc()

        response = jsonify({"error": "Server error", "details": str(error)})
        response.status_code = 500
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response

    # Ensure CORS headers are present on ALL responses (including errors from routes)
    @app.after_request
    def add_cors_headers(response):
        # Only add if not already present (avoid duplicates)
        if 'Access-Control-Allow-Origin' not in response.headers:
            response.headers['Access-Control-Allow-Origin'] = '*'
        if 'Access-Control-Allow-Methods' not in response.headers:
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE'
        if 'Access-Control-Allow-Headers' not in response.headers:
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response

    # Initialize SQLAlchemy
    db.init_app(app)

    # Initialize Flask-Migrate for database migrations
    migrate.init_app(app, db)

    # Create database tables and run auto-validation
    with app.app_context():
        # Import all models before create_all to ensure tables are created
        from models.transaction import Transaction
        from models.gls_tender import GLSTender
        from models.new_launch import NewLaunch
        from models.popular_school import PopularSchool
        from models.project_location import ProjectLocation
        from models.project_inventory import ProjectInventory

        db.create_all()
        print("✓ Database initialized - using SQL-only aggregation for memory efficiency")

        # Print database connection info for verification
        try:
            from sqlalchemy import text
            db_info = db.session.execute(text(
                "SELECT current_database(), inet_server_addr(), inet_server_port()"
            )).fetchone()
            print(f"   Database: {db_info[0]} @ {db_info[1] or 'localhost'}:{db_info[2] or 5432}")
        except Exception:
            pass  # Non-critical diagnostic

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

        # Auto-validate data on startup (self-healing)
        # This runs inside create_app() so it works with gunicorn
        _run_startup_validation()

        # GLS data freshness check - refresh if stale or bad data
        try:
            from services.gls_scheduler import check_and_refresh_on_startup
            check_and_refresh_on_startup(app)
        except Exception as e:
            print(f"⚠️  GLS startup check skipped: {e}")

    # Register routes
    # Analytics routes (PUBLIC - no authentication required)
    from routes.analytics import analytics_bp
    app.register_blueprint(analytics_bp, url_prefix='/api')

    # Auth routes (JWT-based authentication)
    from routes.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

    # Ad serving routes
    from routes.ads import ads_bp
    app.register_blueprint(ads_bp, url_prefix='/api/ads')

    # GLS (Government Land Sales) routes
    from routes.gls import gls_bp
    app.register_blueprint(gls_bp, url_prefix='/api/gls')

    # New Launches (2026 condo launches) routes
    from routes.new_launches import new_launches_bp
    app.register_blueprint(new_launches_bp, url_prefix='/api/new-launches')

    # Projects routes (school proximity, geocoding)
    from routes.projects import projects_bp
    app.register_blueprint(projects_bp, url_prefix='/api')

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
    app.run(debug=True, host="0.0.0.0", port=5000)


if __name__ == "__main__":
    run_app()
