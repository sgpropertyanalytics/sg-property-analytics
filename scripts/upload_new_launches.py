#!/usr/bin/env python3
"""
Upload new launch condo data from CSV file.

Usage:
    python scripts/upload_new_launches.py data/new_launches_2026.csv
    python scripts/upload_new_launches.py data/new_launches_2026.csv --reset
    python scripts/upload_new_launches.py data/new_launches_2026.csv --dry-run
    python scripts/upload_new_launches.py data/new_launches_2026.csv --year 2025
"""
import argparse
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import create_app
from models.database import db
from services.new_launch_upload import upload_new_launches


def main():
    parser = argparse.ArgumentParser(
        description='Upload new launch condo data from CSV file'
    )
    parser.add_argument(
        'csv_file',
        help='Path to CSV file containing new launch data'
    )
    parser.add_argument(
        '--year',
        type=int,
        default=2026,
        help='Launch year (default: 2026)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Validate CSV without uploading to database'
    )
    parser.add_argument(
        '--reset',
        action='store_true',
        help='Delete existing records for the year before uploading'
    )

    args = parser.parse_args()

    # Check file exists
    if not os.path.exists(args.csv_file):
        print(f"Error: File not found: {args.csv_file}")
        sys.exit(1)

    # Create Flask app context
    app = create_app()

    with app.app_context():
        stats = upload_new_launches(
            file_path=args.csv_file,
            db_session=db.session,
            dry_run=args.dry_run,
            reset=args.reset,
            year=args.year
        )

        if stats.get('errors') or stats.get('validation_errors'):
            sys.exit(1)


if __name__ == '__main__':
    main()
