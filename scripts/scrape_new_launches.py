#!/usr/bin/env python3
"""
CLI runner for new launches data management.

Primary method: Excel/CSV import (source-of-truth)
    python scripts/scrape_new_launches.py --excel data/new_launches_2026.csv

Fallback: Seed data
    python scripts/scrape_new_launches.py --seed

Usage:
    python scripts/scrape_new_launches.py --excel data/new_launches_2026.csv
    python scripts/scrape_new_launches.py --excel data/new_launches_2026.csv --reset
    python scripts/scrape_new_launches.py --seed
    python scripts/scrape_new_launches.py --seed --reset
    python scripts/scrape_new_launches.py --dry-run --excel data/new_launches_2026.csv
"""
import argparse
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import create_app
from models.database import db
from services.new_launch_scraper import seed_new_launches


def main():
    parser = argparse.ArgumentParser(
        description='Manage 2026 new launches data (Excel import or seed)'
    )
    parser.add_argument(
        '--year',
        type=int,
        default=2026,
        help='Target year (default: 2026)'
    )
    parser.add_argument(
        '--excel',
        type=str,
        metavar='FILE',
        help='Import from Excel/CSV file (recommended - source-of-truth)'
    )
    parser.add_argument(
        '--seed',
        action='store_true',
        help='Load seed data (fallback when Excel not available)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without saving to database'
    )
    parser.add_argument(
        '--reset',
        action='store_true',
        help='Delete existing records for the year first'
    )
    parser.add_argument(
        '--verbose',
        '-v',
        action='store_true',
        help='Enable verbose output'
    )

    args = parser.parse_args()

    # Require at least one data source
    if not args.excel and not args.seed:
        parser.print_help()
        print("\nError: Please specify --excel FILE or --seed")
        sys.exit(1)

    # Create Flask app context
    app = create_app()

    with app.app_context():
        # Priority: Excel > Seed
        if args.excel:
            # Excel/CSV import (recommended)
            from services.excel_loader import load_new_launches_excel

            stats = load_new_launches_excel(
                file_path=args.excel,
                db_session=db.session,
                dry_run=args.dry_run,
                reset=args.reset,
                year=args.year
            )

            if stats.get('errors') or stats.get('validation_errors'):
                sys.exit(1)
            return

        if args.seed:
            # Load seed data (fallback)
            print(f"\n{'='*60}")
            print(f"New Launches - Loading Seed Data")
            print(f"{'='*60}")
            print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
            print(f"Reset: {'Yes' if args.reset else 'No'}")
            print(f"{'='*60}\n")

            if args.dry_run:
                print("DRY RUN: Would load seed projects")
                print("\nProjects that would be inserted:")
                from services.new_launch_scraper import SEED_DATA_2026
                for p in SEED_DATA_2026:
                    print(f"  - {p['project_name']} ({p['market_segment']}) - {p['developer']}")
            else:
                stats = seed_new_launches(db_session=db.session, reset=args.reset)
                print(f"\nSeed data loaded successfully!")
                print(f"Inserted: {stats['inserted']} projects")


if __name__ == '__main__':
    main()
