"""
Test Inventory Calculation - Verifies unsold units calculation works correctly

This script:
1. Creates the project_inventory table if not exists
2. Adds sample inventory data for known projects
3. Tests the API endpoint to verify the unsold calculation

Run: python scripts/test_inventory.py
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from config import Config
from models.database import db
from models.transaction import Transaction
from models.project_inventory import ProjectInventory
from services.inventory_sync import get_inventory_sync
from sqlalchemy import func


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def test_inventory_calculation():
    """Test the unsold inventory calculation"""
    print("=" * 60)
    print("Testing Inventory Calculation")
    print("=" * 60)

    app = create_app()

    with app.app_context():
        # 1. Ensure project_inventory table exists
        print("\n1. Creating project_inventory table if not exists...")
        db.create_all()
        print("   ✓ Table created/verified")

        # 2. Get top 10 projects by transaction count
        print("\n2. Finding top projects by transaction count...")
        top_projects = db.session.query(
            Transaction.project_name,
            func.count(Transaction.id).label('total_count'),
            func.sum(
                db.case((Transaction.sale_type == 'New Sale', 1), else_=0)
            ).label('new_sale_count'),
            func.sum(
                db.case((Transaction.sale_type == 'Resale', 1), else_=0)
            ).label('resale_count')
        ).filter(
            Transaction.outlier_filter()
        ).group_by(
            Transaction.project_name
        ).order_by(
            func.count(Transaction.id).desc()
        ).limit(10).all()

        print(f"   Found {len(top_projects)} projects")

        # 3. Add sample inventory data for testing
        print("\n3. Adding sample inventory data...")

        # Sample data - you would get this from URA/PropertyGuru/EdgeProp
        # Format: (project_name, total_units, source)
        sample_inventory = [
            # Add some real projects with estimated total units
            # These numbers are examples - replace with actual data
        ]

        # Auto-generate test data based on top projects
        for project_name, total_count, new_sale_count, resale_count in top_projects:
            # For testing: assume total units is new_sale_count + 10-20% buffer
            # In production, this would come from URA API or manual entry
            estimated_total = int(new_sale_count * 1.15) if new_sale_count > 0 else int(total_count * 1.1)
            if estimated_total > 0:
                sample_inventory.append((project_name, estimated_total, 'TEST_DATA'))

        for project_name, total_units, source in sample_inventory[:5]:  # Only add first 5 for testing
            try:
                record = ProjectInventory.upsert_manual(
                    project_name=project_name,
                    total_units=total_units,
                    source_url=f"https://example.com/{project_name.replace(' ', '-').lower()}",
                    verified_by="test_script"
                )
                print(f"   ✓ Added: {project_name} = {total_units} units")
            except Exception as e:
                print(f"   ✗ Error adding {project_name}: {e}")

        # 4. Test the inventory sync service
        print("\n4. Testing inventory calculation...")
        sync_service = get_inventory_sync()

        for project_name, total_count, new_sale_count, resale_count in top_projects[:5]:
            result = sync_service.get_inventory_with_sales(project_name)

            print(f"\n   Project: {project_name}")
            print(f"   - Total Units: {result.get('total_units', 'N/A')}")
            print(f"   - New Sales: {result.get('cumulative_new_sales', 0)}")
            print(f"   - Resales: {result.get('cumulative_resales', 0)}")
            print(f"   - Est. Unsold: {result.get('estimated_unsold', 'N/A')}")
            print(f"   - Data Source: {result.get('data_source', 'N/A')}")
            print(f"   - Confidence: {result.get('confidence', 'N/A')}")

            # Verify calculation
            if result.get('total_units') and result.get('estimated_unsold') is not None:
                expected_unsold = result['total_units'] - result['cumulative_new_sales']
                actual_unsold = result['estimated_unsold']
                if expected_unsold == actual_unsold:
                    print(f"   ✓ Calculation verified: {result['total_units']} - {result['cumulative_new_sales']} = {actual_unsold}")
                else:
                    print(f"   ✗ Calculation mismatch! Expected {expected_unsold}, got {actual_unsold}")

        # 5. Summary
        print("\n" + "=" * 60)
        inventory_count = ProjectInventory.query.count()
        pending_count = len(ProjectInventory.get_pending_records())
        print(f"Summary:")
        print(f"  - Total inventory records: {inventory_count}")
        print(f"  - Pending lookup: {pending_count}")
        print("=" * 60)


def list_projects_without_inventory():
    """List projects that don't have inventory data"""
    print("\n" + "=" * 60)
    print("Projects Without Inventory Data (Top 20)")
    print("=" * 60)

    app = create_app()

    with app.app_context():
        sync_service = get_inventory_sync()
        new_projects = sync_service.get_new_projects()

        # Get transaction counts for these projects
        if new_projects:
            project_counts = db.session.query(
                Transaction.project_name,
                func.count(Transaction.id).label('count')
            ).filter(
                Transaction.project_name.in_(new_projects),
                Transaction.outlier_filter()
            ).group_by(
                Transaction.project_name
            ).order_by(
                func.count(Transaction.id).desc()
            ).limit(20).all()

            print(f"\nFound {len(new_projects)} projects without inventory data")
            print("\nTop 20 by transaction count:")
            for project_name, count in project_counts:
                print(f"  - {project_name}: {count} transactions")
        else:
            print("\nAll projects have inventory data!")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Test inventory calculation")
    parser.add_argument("--list-missing", action="store_true", help="List projects without inventory data")
    args = parser.parse_args()

    if args.list_missing:
        list_projects_without_inventory()
    else:
        test_inventory_calculation()
