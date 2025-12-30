#!/usr/bin/env python3
"""
Geocode Schools

Geocodes popular schools that don't have coordinates.
Uses OneMap API with multiple fallback strategies:
1. Postal code (most reliable when available)
2. School name + "Primary School Singapore"
3. School name alone

Usage:
    python scripts/geocode_schools.py
    python scripts/geocode_schools.py --dry-run
"""
import sys

from flask import Flask
from config import Config
from models.database import db
from models.popular_school import PopularSchool
from services.geocoder import OneMapGeocoder


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def geocode_single_school(geocoder: OneMapGeocoder, school_name: str, postal_code: str = None):
    """
    Try multiple strategies to geocode a school.

    Returns (result, strategy_used) or (None, None) if all fail.
    """
    strategies = []

    # Strategy 1: Postal code (most reliable)
    if postal_code and postal_code.strip():
        strategies.append(('postal_code', postal_code.strip()))

    # Strategy 2: School name + "Primary School Singapore"
    strategies.append(('name_primary', f"{school_name} Primary School Singapore"))

    # Strategy 3: School name + "School Singapore"
    strategies.append(('name_school', f"{school_name} School Singapore"))

    # Strategy 4: Just school name
    strategies.append(('name_only', school_name))

    for strategy_name, query in strategies:
        if strategy_name == 'postal_code':
            result = geocoder.geocode_postal_code(query)
        else:
            result = geocoder.geocode(query)

        if result:
            return result, strategy_name

    return None, None


def geocode_schools(dry_run: bool = False):
    """Geocode schools without coordinates using multiple strategies"""

    app = create_app()
    geocoder = OneMapGeocoder()

    # Test connection
    print("Testing OneMap API connection...")
    if not geocoder.test_connection():
        print("ERROR: OneMap API not accessible!")
        return
    print("OneMap API connection OK\n")

    with app.app_context():
        # Get schools without coordinates
        schools = db.session.query(PopularSchool).filter(
            db.or_(
                PopularSchool.latitude.is_(None),
                PopularSchool.longitude.is_(None)
            )
        ).all()

        if not schools:
            print("No schools need geocoding (all have coordinates)")
            return

        print(f"Found {len(schools)} schools to geocode\n")
        print("-" * 60)

        success_count = 0
        failed_count = 0
        failed_schools = []

        for i, school in enumerate(schools, 1):
            postal_code = school.postal_code.strip() if school.postal_code else None
            print(f"[{i}/{len(schools)}] {school.school_name}")
            if postal_code:
                print(f"    Postal: {postal_code}")

            # Try multiple geocoding strategies
            result, strategy = geocode_single_school(
                geocoder,
                school.school_name,
                postal_code
            )

            if result:
                print(f"    Strategy: {strategy}")
                print(f"    Lat: {result.latitude:.6f}, Lng: {result.longitude:.6f}")
                print(f"    Address: {result.address}")

                if not dry_run:
                    school.latitude = result.latitude
                    school.longitude = result.longitude
                    if not school.address:
                        school.address = result.address

                success_count += 1
            else:
                print("    FAILED - all strategies exhausted")
                failed_count += 1
                failed_schools.append(school.school_name)

            print()

        if not dry_run:
            db.session.commit()

        # Summary
        print("=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"Successfully geocoded: {success_count}")
        print(f"Failed: {failed_count}")

        if failed_schools:
            print(f"\nFailed schools (need manual coordinates):")
            for name in failed_schools:
                print(f"  - {name}")

        if dry_run:
            print("\n(Dry run - no changes saved)")
        else:
            # Show final stats
            total = db.session.query(PopularSchool).count()
            with_coords = db.session.query(PopularSchool).filter(
                PopularSchool.latitude.isnot(None),
                PopularSchool.longitude.isnot(None)
            ).count()
            print(f"\nTotal schools: {total}")
            print(f"With coordinates: {with_coords}")
            print(f"Missing coordinates: {total - with_coords}")


def main():
    print("=" * 60)
    print("Geocode Schools (Multi-Strategy)")
    print("=" * 60 + "\n")

    dry_run = '--dry-run' in sys.argv

    if dry_run:
        print("DRY RUN MODE - no changes will be saved\n")

    geocode_schools(dry_run)

    print("\nDone!")


if __name__ == "__main__":
    main()
