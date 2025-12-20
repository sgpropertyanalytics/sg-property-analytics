#!/usr/bin/env python3
"""
Geocode Schools by Postal Code

Geocodes popular schools that have postal codes but no coordinates.
Uses OneMap API to convert postal codes to lat/lng.

Usage:
    python scripts/geocode_schools.py
    python scripts/geocode_schools.py --dry-run
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

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


def geocode_schools(dry_run: bool = False):
    """Geocode schools without coordinates using their postal codes"""

    app = create_app()
    geocoder = OneMapGeocoder()

    # Test connection
    print("Testing OneMap API connection...")
    if not geocoder.test_connection():
        print("ERROR: OneMap API not accessible!")
        return
    print("OneMap API connection OK\n")

    with app.app_context():
        # Get schools without coordinates but with postal codes
        schools = db.session.query(PopularSchool).filter(
            PopularSchool.postal_code.isnot(None),
            PopularSchool.postal_code != '',
            db.or_(
                PopularSchool.latitude.is_(None),
                PopularSchool.longitude.is_(None)
            )
        ).all()

        if not schools:
            print("No schools need geocoding (all have coordinates or no postal codes)")
            return

        print(f"Found {len(schools)} schools to geocode\n")
        print("-" * 60)

        success_count = 0
        failed_count = 0

        for i, school in enumerate(schools, 1):
            postal_code = school.postal_code.strip()
            print(f"[{i}/{len(schools)}] {school.school_name}")
            print(f"    Postal: {postal_code}")

            # Geocode by postal code
            result = geocoder.geocode_postal_code(postal_code)

            if result:
                print(f"    Lat: {result.latitude:.6f}, Lng: {result.longitude:.6f}")
                print(f"    Address: {result.address}")

                if not dry_run:
                    school.latitude = result.latitude
                    school.longitude = result.longitude
                    if not school.address:
                        school.address = result.address
                else:
                    print("    (dry-run: not saving)")

                success_count += 1
            else:
                print("    FAILED - no results from OneMap")
                failed_count += 1

            print()

        if not dry_run:
            db.session.commit()

        # Summary
        print("=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"Successfully geocoded: {success_count}")
        print(f"Failed: {failed_count}")

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
    print("Geocode Schools by Postal Code")
    print("=" * 60 + "\n")

    dry_run = '--dry-run' in sys.argv

    if dry_run:
        print("DRY RUN MODE - no changes will be saved\n")

    geocode_schools(dry_run)

    print("\nDone!")


if __name__ == "__main__":
    main()
