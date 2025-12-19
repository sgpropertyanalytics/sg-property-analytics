#!/usr/bin/env python3
"""
CLI runner for new launches scraper.

Scrapes 2026 private condo launches from 3 sources:
- EdgeProp (primary, research-grade)
- PropNex (agency source)
- ERA (agency source)

Uses Playwright for JavaScript rendering. Install with:
    pip install playwright && playwright install chromium

Cross-validates data and stores in database.

Usage:
    python scripts/scrape_new_launches.py                # Scrape from web sources
    python scripts/scrape_new_launches.py --seed         # Load seed data (fallback)
    python scripts/scrape_new_launches.py --seed --reset # Reset and reload seed data
    python scripts/scrape_new_launches.py --year 2026
    python scripts/scrape_new_launches.py --dry-run
    python scripts/scrape_new_launches.py --reset
"""
import argparse
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import create_app
from models.database import db
from services.new_launch_scraper import scrape_new_launches, seed_new_launches


def main():
    parser = argparse.ArgumentParser(
        description='Scrape 2026 new launches from EdgeProp, PropNex, ERA'
    )
    parser.add_argument(
        '--year',
        type=int,
        default=2026,
        help='Target year to scrape (default: 2026)'
    )
    parser.add_argument(
        '--seed',
        action='store_true',
        help='Load seed data instead of scraping (fallback when scraping fails)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without saving to database'
    )
    parser.add_argument(
        '--reset',
        action='store_true',
        help='Delete existing records for the year before scraping/seeding'
    )
    parser.add_argument(
        '--verbose',
        '-v',
        action='store_true',
        help='Enable verbose output'
    )

    args = parser.parse_args()

    # Create Flask app context
    app = create_app()

    with app.app_context():
        if args.seed:
            # Load seed data (fallback - use when scraping fails)
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
        else:
            # Web scraping logic
            from services.new_launch_scraper import PLAYWRIGHT_AVAILABLE

            print(f"\n{'='*60}")
            print(f"New Launches Scraper")
            print(f"{'='*60}")
            print(f"Target year: {args.year}")
            print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
            print(f"Playwright: {'Available' if PLAYWRIGHT_AVAILABLE else 'NOT INSTALLED'}")
            print(f"{'='*60}\n")

            if not PLAYWRIGHT_AVAILABLE:
                print("⚠️  WARNING: Playwright not installed!")
                print("   JavaScript-rendered content will NOT be captured.")
                print("   Install with: pip install playwright && playwright install chromium")
                print("   Or use --seed flag for fallback data.\n")

            if args.reset and not args.dry_run:
                from models.new_launch import NewLaunch

                print(f"Resetting: Deleting existing records for {args.year}...")
                deleted = db.session.query(NewLaunch).filter(
                    NewLaunch.launch_year == args.year
                ).delete()
                db.session.commit()
                print(f"  Deleted {deleted} existing records\n")

            # Run the scraper
            stats = scrape_new_launches(
                target_year=args.year,
                db_session=db.session,
                dry_run=args.dry_run
            )

            # Print summary
            print(f"\n{'='*60}")
            print("Summary")
            print(f"{'='*60}")
            print(f"EdgeProp scraped: {stats.get('edgeprop_scraped', 0)}")
            print(f"PropNex scraped: {stats.get('propnex_scraped', 0)}")
            print(f"ERA scraped: {stats.get('era_scraped', 0)}")
            print(f"Unique projects: {stats.get('total_unique_projects', 0)}")
            print(f"Saved: {stats.get('projects_saved', 0)}")
            print(f"Updated: {stats.get('projects_updated', 0)}")
            print(f"Needs review: {stats.get('needs_review', 0)}")
            print(f"GLS linked: {stats.get('gls_linked', 0)}")

            if stats.get('total_unique_projects', 0) == 0:
                print("\n⚠️  No projects found from web scraping.")
                print("    Possible causes:")
                print("    1. Playwright not installed (needed for JS rendering)")
                print("    2. Rate limiting / bot detection from websites")
                print("    3. Website structure changed")
                print("    Solutions:")
                print("    - Install Playwright: pip install playwright && playwright install chromium")
                print("    - Check /tmp/scraper_debug/ for saved HTML files")
                print("    - Use --seed flag for fallback data")

            if stats.get('errors'):
                print(f"\nErrors ({len(stats['errors'])}):")
                for error in stats['errors'][:10]:
                    print(f"  - {error}")
                if len(stats['errors']) > 10:
                    print(f"  ... and {len(stats['errors']) - 10} more")

            print(f"\n{'='*60}")
            print("Done!" if not args.dry_run else "Done! (dry run - no changes saved)")
            print(f"{'='*60}\n")


if __name__ == '__main__':
    main()
