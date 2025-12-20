"""
Project Location Service

Provides functions to:
1. Sync project_locations table with transactions
2. Geocode new projects incrementally
3. Update school flags for new projects

This service is called after transaction uploads to keep project_locations up to date.
"""

from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy import func


def sync_project_locations_from_transactions(app) -> Dict[str, int]:
    """
    Sync project_locations table with transactions table.

    For each unique project in transactions:
    - If not in project_locations: create new record
    - If exists: update transaction stats

    Args:
        app: Flask app context

    Returns:
        Dict with stats: {'new': int, 'updated': int}
    """
    from models.database import db
    from models.transaction import Transaction
    from models.project_location import ProjectLocation

    stats = {'new': 0, 'updated': 0}

    with app.app_context():
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

        # Get existing projects
        existing = {
            p.project_name: p
            for p in db.session.query(ProjectLocation).all()
        }

        for stat in project_stats:
            project_name = stat.project_name
            if not project_name or not project_name.strip():
                continue

            if project_name in existing:
                # Update existing record
                project = existing[project_name]
                project.transaction_count = stat.transaction_count
                if stat.first_date:
                    project.first_transaction_date = stat.first_date
                if stat.last_date:
                    project.last_transaction_date = stat.last_date
                project.updated_at = datetime.utcnow()
                stats['updated'] += 1
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
                stats['new'] += 1

        db.session.commit()

    return stats


def geocode_new_projects(app, limit: int = None) -> Dict[str, int]:
    """
    Geocode projects that have 'pending' geocode_status.

    Args:
        app: Flask app context
        limit: Maximum number of projects to geocode

    Returns:
        Dict with stats: {'success': int, 'failed': int}
    """
    from models.database import db
    from models.project_location import ProjectLocation
    from services.geocoder import OneMapGeocoder

    stats = {'success': 0, 'failed': 0}

    geocoder = OneMapGeocoder()

    # Test connection
    if not geocoder.test_connection():
        print("WARNING: OneMap API not accessible. Skipping geocoding.")
        return stats

    with app.app_context():
        query = db.session.query(ProjectLocation).filter_by(geocode_status='pending')

        if limit:
            query = query.limit(limit)

        projects = query.all()

        for project in projects:
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
            else:
                project.geocode_status = 'failed'
                project.geocode_error = 'No results from OneMap API'
                project.last_geocoded_at = datetime.utcnow()
                stats['failed'] += 1

        db.session.commit()

    return stats


def update_school_flags_for_new_projects(app) -> Dict[str, int]:
    """
    Update school flags for projects that have coordinates but no flag computed.

    Args:
        app: Flask app context

    Returns:
        Dict with stats: {'updated': int, 'with_school': int}
    """
    from models.database import db
    from models.project_location import ProjectLocation
    from models.popular_school import PopularSchool
    from services.school_distance import has_school_within_distance

    stats = {'updated': 0, 'with_school': 0}

    with app.app_context():
        # Load school coordinates
        schools = db.session.query(
            PopularSchool.latitude,
            PopularSchool.longitude
        ).filter(
            PopularSchool.latitude.isnot(None),
            PopularSchool.longitude.isnot(None)
        ).all()

        if not schools:
            print("No schools with coordinates found. Skipping school flag update.")
            return stats

        school_coords = [
            (float(s.latitude), float(s.longitude))
            for s in schools
        ]

        # Get projects with coordinates but no school flag
        projects = db.session.query(ProjectLocation).filter(
            ProjectLocation.latitude.isnot(None),
            ProjectLocation.longitude.isnot(None),
            ProjectLocation.geocode_status == 'success',
            ProjectLocation.has_popular_school_1km.is_(None)
        ).all()

        for project in projects:
            try:
                has_school = has_school_within_distance(
                    float(project.latitude),
                    float(project.longitude),
                    school_coords
                )
                project.has_popular_school_1km = has_school
                stats['updated'] += 1
                if has_school:
                    stats['with_school'] += 1
            except (ValueError, TypeError) as e:
                print(f"Error processing {project.project_name}: {e}")

        db.session.commit()

    return stats


def run_incremental_update(app, geocode_limit: int = 50) -> Dict[str, Any]:
    """
    Run incremental update after transaction upload.

    Steps:
    1. Sync new projects from transactions
    2. Geocode new projects (limited to avoid API rate limits)
    3. Update school flags for newly geocoded projects

    Args:
        app: Flask app context
        geocode_limit: Maximum projects to geocode per run

    Returns:
        Dict with all stats
    """
    print("\n" + "="*60)
    print("Running incremental project location update...")
    print("="*60)

    # Step 1: Sync projects
    print("\n1. Syncing projects from transactions...")
    sync_stats = sync_project_locations_from_transactions(app)
    print(f"   New: {sync_stats['new']}, Updated: {sync_stats['updated']}")

    # Step 2: Geocode (limited)
    print(f"\n2. Geocoding pending projects (limit: {geocode_limit})...")
    geocode_stats = geocode_new_projects(app, limit=geocode_limit)
    print(f"   Success: {geocode_stats['success']}, Failed: {geocode_stats['failed']}")

    # Step 3: Update school flags
    print("\n3. Updating school proximity flags...")
    school_stats = update_school_flags_for_new_projects(app)
    print(f"   Updated: {school_stats['updated']}, With school: {school_stats['with_school']}")

    print("\n" + "="*60)
    print("Incremental update complete!")
    print("="*60)

    return {
        'sync': sync_stats,
        'geocode': geocode_stats,
        'school_flags': school_stats
    }


def get_project_location_stats(app) -> Dict[str, int]:
    """Get summary statistics for project_locations table."""
    from models.database import db
    from models.project_location import ProjectLocation

    with app.app_context():
        total = db.session.query(ProjectLocation).count()
        pending = db.session.query(ProjectLocation).filter_by(geocode_status='pending').count()
        success = db.session.query(ProjectLocation).filter_by(geocode_status='success').count()
        failed = db.session.query(ProjectLocation).filter_by(geocode_status='failed').count()
        with_school = db.session.query(ProjectLocation).filter_by(has_popular_school_1km=True).count()

        return {
            'total': total,
            'pending': pending,
            'geocoded': success,
            'failed': failed,
            'with_school': with_school,
            'without_school': success - with_school
        }
