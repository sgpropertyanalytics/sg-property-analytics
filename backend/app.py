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


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize CORS - allow all origins to ensure it works (can restrict later)
    CORS(app,
         resources={r"/api/*": {"origins": "*"}},
         methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
         allow_headers=["Content-Type", "Authorization"],
         supports_credentials=False)

    # Also add after_request handler to ensure CORS headers are always set, even on errors
    @app.after_request
    def after_request(response):
        # Always set CORS headers, even for error responses
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        return response

    # Initialize SQLAlchemy
    db.init_app(app)

    # Initialize Flask-Migrate for database migrations
    migrate.init_app(app, db)

    # Create database tables
    with app.app_context():
        db.create_all()
        print("✓ Database initialized - using SQL-only aggregation for memory efficiency")

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
    """Main entry point - starts server with SQL-only analytics."""
    print("=" * 60)
    print("Starting Flask API - SQL-Only Analytics Architecture")
    print("=" * 60)

    # Create app
    app = create_app()

    with app.app_context():
        from models.transaction import Transaction
        from services.analytics_reader import get_reader

        count = db.session.query(Transaction).count()
        metadata = get_reader().get_metadata()

        print(f"\n📊 Database Status:")
        print(f"   Transactions: {count:,}")
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
