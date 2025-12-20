"""
Geocode Projects Script

Extracts unique projects from transactions table and geocodes them using OneMap API.

Steps:
1. Extract unique project names from transactions (with district, market_segment)
2. Create/update project_location records
3. Geocode projects without coordinates
4. Compute school proximity flags

Usage:
    python scripts/geocode_projects.py                # Full run (extract + geocode + compute flags)
    python scripts/geocode_projects.py --extract      # Only extract projects from transactions
    python scripts/geocode_projects.py --geocode      # Only geocode pending projects
    python scripts/geocode_projects.py --compute      # Only compute school flags
    python scripts/geocode_projects.py --limit 100    # Limit geocoding to 100 projects
"""

import sys
import os
import time
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from config import Config
from models.database import db
from models.transaction import Transaction
from models.project_location import ProjectLocation
from services.geocoder import OneMapGeocoder
from services.school_distance import compute_school_flags_batch
from sqlalchemy import func


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def extract_projects_from_transactions(app):
    """
    Extract unique projects from transactions and create project_location records.

    Returns count of new projects added.
    """
    print("\n" + "="*60)
    print("STEP 1: Extracting unique projects from transactions")
    print("="*60)

    with app.app_context():
        # Create tables if needed
        db.create_all()

        # Get unique projects with their district and transaction stats
        project_stats = db.session.query(
            Transaction.project_name,
            Transaction.district,
            func.count(Transaction.id).label('transaction_count'),
            func.min(Transaction.transaction_date).label('first_date'),
            func.max(Transaction.transaction_date).label('last_date')
        ).group_by(
            Transaction.project_name,
            Transaction.district
        ).all()

        print(f"Found {len(project_stats)} unique project-district combinations")

        # Get existing projects
        existing_projects = set(
            p[0] for p in db.session.query(ProjectLocation.project_name).all()
        )
        print(f"Existing projects in project_locations: {len(existing_projects)}")

        new_count = 0
        updated_count = 0

        for stat in project_stats:
            project_name = stat.project_name
            if not project_name or not project_name.strip():
                continue

            # Check if exists
            if project_name in existing_projects:
                # Update existing record
                project = db.session.query(ProjectLocation).filter_by(
                    project_name=project_name
                ).first()

                if project:
                    # Update transaction stats
                    project.transaction_count = stat.transaction_count
                    if stat.first_date:
                        project.first_transaction_date = stat.first_date
                    if stat.last_date:
                        project.last_transaction_date = stat.last_date
                    updated_count += 1

            else:
                # Create new record
                market_segment = ProjectLocation.get_market_segment(stat.district)

                project = ProjectLocation(
                    project_name=project_name,
                    district=stat.district,
                    market_segment=market_segment,
                    geocode_status='pending',
                    transaction_count=stat.transaction_count,
                    first_transaction_date=stat.first_date,
                    last_transaction_date=stat.last_date
                )
                db.session.add(project)
                new_count += 1

        db.session.commit()

        print(f"\nAdded {new_count} new projects")
        print(f"Updated {updated_count} existing projects")

        return new_count


def geocode_pending_projects(app, limit: int = None):
    """
    Geocode projects that don't have coordinates yet.

    Args:
        app: Flask app
        limit: Maximum number of projects to geocode (for testing)

    Returns:
        Dict with stats
    """
    print("\n" + "="*60)
    print("STEP 2: Geocoding projects")
    print("="*60)

    stats = {
        'total': 0,
        'success': 0,
        'failed': 0,
        'skipped': 0
    }

    geocoder = OneMapGeocoder()

    # Test connection
    if not geocoder.test_connection():
        print("ERROR: OneMap API not accessible!")
        return stats

    print("OneMap API connection OK")

    with app.app_context():
        # Get pending projects
        query = db.session.query(ProjectLocation).filter(
            ProjectLocation.geocode_status.in_(['pending', 'failed'])
        )

        if limit:
            query = query.limit(limit)

        projects = query.all()
        stats['total'] = len(projects)

        print(f"Found {stats['total']} projects to geocode")

        for i, project in enumerate(projects):
            print(f"\n[{i+1}/{stats['total']}] {project.project_name} ({project.district})")

            # Skip if already has coordinates (shouldn't happen but check anyway)
            if project.latitude and project.longitude:
                stats['skipped'] += 1
                print("  Skipped (already has coordinates)")
                continue

            # Try geocoding
            result = geocoder.geocode_project(
                project_name=project.project_name,
                district=project.district
            )

            if result:
                project.latitude = result.latitude
                project.longitude = result.longitude
                project.address = result.address
                project.postal_code = result.postal_code
                project.geocode_status = 'success'
                project.geocode_source = result.source
                project.geocode_error = None
                project.last_geocoded_at = datetime.utcnow()

                stats['success'] += 1
                print(f"  OK: {result.latitude:.6f}, {result.longitude:.6f}")
                print(f"  Address: {result.address}")
            else:
                project.geocode_status = 'failed'
                project.geocode_error = 'No results from OneMap API'
                project.last_geocoded_at = datetime.utcnow()

                stats['failed'] += 1
                print("  FAILED - no results")

            # Commit every 10 projects
            if (i + 1) % 10 == 0:
                db.session.commit()
                print(f"  [Committed batch of 10]")

        # Final commit
        db.session.commit()

    print("\n" + "-"*40)
    print(f"Geocoding complete:")
    print(f"  Success: {stats['success']}")
    print(f"  Failed: {stats['failed']}")
    print(f"  Skipped: {stats['skipped']}")

    return stats


def compute_school_flags(app):
    """Compute school proximity flags for all geocoded projects"""
    print("\n" + "="*60)
    print("STEP 3: Computing school proximity flags")
    print("="*60)

    return compute_school_flags_batch(app)


def print_summary(app):
    """Print summary of project locations"""
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    with app.app_context():
        total = db.session.query(ProjectLocation).count()
        pending = db.session.query(ProjectLocation).filter_by(geocode_status='pending').count()
        success = db.session.query(ProjectLocation).filter_by(geocode_status='success').count()
        failed = db.session.query(ProjectLocation).filter_by(geocode_status='failed').count()

        with_school = db.session.query(ProjectLocation).filter_by(has_popular_school_1km=True).count()
        without_school = db.session.query(ProjectLocation).filter_by(has_popular_school_1km=False).count()

        print(f"Total projects: {total}")
        print(f"  Geocoded successfully: {success}")
        print(f"  Geocoding failed: {failed}")
        print(f"  Pending geocoding: {pending}")
        print(f"\nSchool proximity:")
        print(f"  With popular school within 1km: {with_school}")
        print(f"  Without: {without_school}")
        print(f"  Not computed: {total - with_school - without_school}")


def main():
    """Main entry point"""
    print("="*60)
    print("Project Geocoding and School Flag Computation")
    print("="*60)

    # Parse arguments
    extract_only = '--extract' in sys.argv
    geocode_only = '--geocode' in sys.argv
    compute_only = '--compute' in sys.argv
    limit = None

    for i, arg in enumerate(sys.argv):
        if arg == '--limit' and i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])

    app = create_app()

    if extract_only:
        extract_projects_from_transactions(app)
    elif geocode_only:
        geocode_pending_projects(app, limit)
    elif compute_only:
        compute_school_flags(app)
    else:
        # Full run
        extract_projects_from_transactions(app)
        geocode_pending_projects(app, limit)
        compute_school_flags(app)

    print_summary(app)
    print("\nDone!")


if __name__ == "__main__":
    main()
