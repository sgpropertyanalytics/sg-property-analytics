"""
Import Popular Schools Script

Imports Top 35 popular primary schools from Excel/CSV file into the database.

Expected file location: /mnt/user-data/uploads/popular_schools.xlsx (or .csv)

Expected columns:
- school_name (required)
- postal_code (optional)
- latitude (optional - will geocode if missing)
- longitude (optional - will geocode if missing)
- is_gep (optional)
- is_sap (optional)
- school_family (optional)

Usage:
    python scripts/import_schools.py
    python scripts/import_schools.py /path/to/schools.xlsx
    python scripts/import_schools.py --geocode  # Geocode schools without coordinates
"""

import sys
import os

import pandas as pd
from flask import Flask
from config import Config
from models.database import db
from models.popular_school import PopularSchool
from services.geocoder import OneMapGeocoder


# Default file locations to check
DEFAULT_FILE_PATHS = [
    '/mnt/user-data/uploads/popular_schools.xlsx',
    '/mnt/user-data/uploads/popular_schools.csv',
    os.path.join(os.path.dirname(__file__), '..', 'rawdata', 'popular_schools.xlsx'),
    os.path.join(os.path.dirname(__file__), '..', 'rawdata', 'popular_schools.csv'),
]


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def find_schools_file(custom_path: str = None) -> str:
    """Find the schools data file"""
    if custom_path and os.path.exists(custom_path):
        return custom_path

    for path in DEFAULT_FILE_PATHS:
        if os.path.exists(path):
            return path

    return None


def load_schools_data(file_path: str) -> pd.DataFrame:
    """Load schools data from Excel or CSV"""
    if file_path.endswith('.xlsx') or file_path.endswith('.xls'):
        df = pd.read_excel(file_path)
    else:
        df = pd.read_csv(file_path)

    # Normalize column names
    df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')

    return df


def geocode_schools(schools: list, geocoder: OneMapGeocoder) -> int:
    """
    Geocode schools that don't have coordinates.

    Returns number of schools successfully geocoded.
    """
    geocoded_count = 0

    for school in schools:
        if school.latitude and school.longitude:
            continue  # Already has coordinates

        print(f"  Geocoding: {school.school_name}")

        # Try geocoding by school name
        result = geocoder.geocode(f"{school.school_name} Primary School Singapore")

        if not result:
            # Try with just the school name
            result = geocoder.geocode(school.school_name)

        if not result and school.postal_code:
            # Try by postal code
            result = geocoder.geocode_postal_code(school.postal_code)

        if result:
            school.latitude = result.latitude
            school.longitude = result.longitude
            if not school.address:
                school.address = result.address
            if not school.postal_code:
                school.postal_code = result.postal_code
            geocoded_count += 1
            print(f"    OK: {result.latitude:.6f}, {result.longitude:.6f}")
        else:
            print(f"    FAILED - needs manual review")

    return geocoded_count


def import_schools(file_path: str, geocode: bool = False):
    """Import schools from file into database"""
    print(f"\nLoading schools from: {file_path}")

    # Load data
    df = load_schools_data(file_path)

    # Check required columns
    if 'school_name' not in df.columns:
        print("ERROR: 'school_name' column is required")
        return

    print(f"Found {len(df)} schools in file")

    app = create_app()

    with app.app_context():
        # Create tables if needed
        db.create_all()

        # Check existing schools
        existing_count = db.session.query(PopularSchool).count()
        if existing_count > 0:
            response = input(f"\nFound {existing_count} existing schools. Replace? (yes/no): ")
            if response.lower() == 'yes':
                db.session.query(PopularSchool).delete()
                db.session.commit()
                print("Cleared existing schools")
            else:
                print("Keeping existing schools. Will update/add new ones.")

        # Import schools
        imported = 0
        updated = 0

        for _, row in df.iterrows():
            school_name = str(row['school_name']).strip()
            if not school_name or pd.isna(row['school_name']):
                continue

            # Check if school exists
            existing = db.session.query(PopularSchool).filter_by(
                school_name=school_name
            ).first()

            if existing:
                school = existing
                updated += 1
            else:
                school = PopularSchool(school_name=school_name)
                imported += 1

            # Set fields from data
            if 'postal_code' in row and pd.notna(row['postal_code']):
                school.postal_code = str(row['postal_code']).strip()

            if 'latitude' in row and pd.notna(row['latitude']):
                school.latitude = float(row['latitude'])

            if 'longitude' in row and pd.notna(row['longitude']):
                school.longitude = float(row['longitude'])

            if 'is_gep' in row and pd.notna(row['is_gep']):
                school.is_gep = bool(row['is_gep'])

            if 'is_sap' in row and pd.notna(row['is_sap']):
                school.is_sap = bool(row['is_sap'])

            if 'school_family' in row and pd.notna(row['school_family']):
                school.school_family = str(row['school_family']).strip()

            if 'address' in row and pd.notna(row['address']):
                school.address = str(row['address']).strip()

            if not existing:
                db.session.add(school)

        db.session.commit()
        print(f"\nImported {imported} new schools, updated {updated}")

        # Geocode if requested
        if geocode:
            print("\nGeocoding schools without coordinates...")
            geocoder = OneMapGeocoder()

            # Test connection first
            if not geocoder.test_connection():
                print("WARNING: OneMap API not accessible. Skipping geocoding.")
            else:
                schools = db.session.query(PopularSchool).all()
                geocoded = geocode_schools(schools, geocoder)
                db.session.commit()
                print(f"\nGeocoded {geocoded} schools")

        # Final summary
        total = db.session.query(PopularSchool).count()
        with_coords = db.session.query(PopularSchool).filter(
            PopularSchool.latitude.isnot(None),
            PopularSchool.longitude.isnot(None)
        ).count()

        print(f"\n{'='*50}")
        print(f"SUMMARY")
        print(f"{'='*50}")
        print(f"Total schools: {total}")
        print(f"With coordinates: {with_coords}")
        print(f"Needs geocoding: {total - with_coords}")


def main():
    """Main entry point"""
    print("="*60)
    print("Popular Schools Import Script")
    print("="*60)

    # Parse arguments
    file_path = None
    geocode = False

    for arg in sys.argv[1:]:
        if arg == '--geocode':
            geocode = True
        elif not arg.startswith('-'):
            file_path = arg

    # Find file
    file_path = find_schools_file(file_path)

    if not file_path:
        print("\nNo schools file found!")
        print("\nExpected file at one of:")
        for path in DEFAULT_FILE_PATHS:
            print(f"  - {path}")
        print("\nUsage: python import_schools.py [file_path] [--geocode]")
        return

    import_schools(file_path, geocode)

    print("\nDone!")


if __name__ == "__main__":
    main()
