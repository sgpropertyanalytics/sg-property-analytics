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
    Run data validation on startup.

    Called from within create_app() so it works with gunicorn.
    Safe to run repeatedly - if data is clean, does nothing.
    """
    from models.transaction import Transaction
    from services.data_validation import run_all_validations
    from services.data_computation import recompute_all_stats, get_metadata

    count = db.session.query(Transaction).count()
    if count == 0:
        return  # No data to validate

    try:
        # Run all validations
        results = run_all_validations()

        # If any data was cleaned, recompute stats
        if results['total_cleaned'] > 0:
            # Accumulate with previous validation counts
            existing_metadata = get_metadata()
            validation_results = {
                'invalid_removed': existing_metadata.get('invalid_removed', 0) + results['invalid_removed'],
                'duplicates_removed': existing_metadata.get('duplicates_removed', 0) + results['duplicates_removed'],
                'outliers_removed': existing_metadata.get('outliers_excluded', 0) + results['outliers_removed'],
            }

            total_removed = validation_results['invalid_removed'] + validation_results['duplicates_removed'] + validation_results['outliers_removed']
            print(f"   Recomputing stats (total records removed: {total_removed:,})...")
            recompute_all_stats(validation_results)
            print(f"   ✓ Stats recomputed")

    except Exception as e:
        print(f"\n⚠️  Auto-validation skipped: {e}")
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

        db.create_all()
        print("✓ Database initialized - using SQL-only aggregation for memory efficiency")

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
