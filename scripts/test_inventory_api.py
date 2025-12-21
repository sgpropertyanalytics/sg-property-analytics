"""
Test Inventory API Endpoint - Run locally to verify endpoint works

This script:
1. Starts a test Flask app context
2. Tests the inventory API endpoint directly
3. Verifies the response format and calculations

Run: python scripts/test_inventory_api.py
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from config import Config
from models.database import db


def create_test_app():
    """Create Flask app with routes for testing"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)

    # Register analytics blueprint
    from routes.analytics import analytics_bp
    app.register_blueprint(analytics_bp, url_prefix='/api')

    return app


def test_inventory_endpoint():
    """Test the inventory API endpoint"""
    print("=" * 60)
    print("Testing Inventory API Endpoint")
    print("=" * 60)

    app = create_test_app()

    with app.app_context():
        # Ensure tables exist
        from models.project_inventory import ProjectInventory
        db.create_all()

    # Test with Flask test client
    client = app.test_client()

    # Test projects
    test_projects = [
        "NORMANTON PARK",
        "TREASURE AT TAMPINES",
        "THE ORIE",
        "SPRINGLEAF RESIDENCE",
        "SOME UNKNOWN PROJECT"  # Should return null total_units
    ]

    print("\nTesting API endpoints:\n")

    for project in test_projects:
        print(f"GET /api/projects/{project}/inventory")

        # URL encode the project name
        from urllib.parse import quote
        encoded_project = quote(project, safe='')
        response = client.get(f'/api/projects/{encoded_project}/inventory')

        print(f"  Status: {response.status_code}")

        if response.status_code == 200:
            data = response.get_json()
            print(f"  Response:")
            print(f"    - project_name: {data.get('project_name')}")
            print(f"    - total_units: {data.get('total_units')}")
            print(f"    - cumulative_new_sales: {data.get('cumulative_new_sales')}")
            print(f"    - cumulative_resales: {data.get('cumulative_resales')}")
            print(f"    - estimated_unsold: {data.get('estimated_unsold')}")
            print(f"    - data_source: {data.get('data_source')}")
            print(f"    - confidence: {data.get('confidence')}")
            print(f"    - disclaimer: {data.get('disclaimer', 'N/A')[:50]}...")

            # Verify calculation if total_units exists
            if data.get('total_units') and data.get('estimated_unsold') is not None:
                expected = data['total_units'] - data['cumulative_new_sales']
                actual = data['estimated_unsold']
                if expected == actual:
                    print(f"  ✓ Calculation correct")
                else:
                    print(f"  ✗ Calculation wrong: expected {expected}, got {actual}")
        else:
            print(f"  Error: {response.get_json()}")

        print()

    # Test manual inventory endpoint
    print("=" * 60)
    print("Testing Manual Inventory Endpoint")
    print("=" * 60)

    # Add a test project
    print("\nPOST /api/inventory/manual")
    response = client.post('/api/inventory/manual', json={
        'project_name': 'TEST PROJECT ABC',
        'total_units': 500,
        'source_url': 'https://example.com/test',
        'verified_by': 'test_script'
    })
    print(f"  Status: {response.status_code}")
    print(f"  Response: {response.get_json()}")

    # Verify it was added
    print("\nGET /api/projects/TEST PROJECT ABC/inventory")
    response = client.get('/api/projects/TEST%20PROJECT%20ABC/inventory')
    print(f"  Status: {response.status_code}")
    if response.status_code == 200:
        data = response.get_json()
        print(f"  total_units: {data.get('total_units')}")
        print(f"  data_source: {data.get('data_source')}")

    print("\n" + "=" * 60)
    print("API Endpoint Tests Complete")
    print("=" * 60)


if __name__ == "__main__":
    test_inventory_endpoint()
