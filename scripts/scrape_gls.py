"""
GLS Scraper CLI - Scrapes Government Land Sales data from URA

Usage:
    python scripts/scrape_gls.py                # Scrape 2025 (default)
    python scripts/scrape_gls.py --year 2024   # Scrape specific year
    python scripts/scrape_gls.py --dry-run     # Preview without saving
    python scripts/scrape_gls.py --stats       # Show current GLS stats

Pipeline: Scrape URA -> Classify (launched/awarded) -> Geocode -> Store
"""

import sys
import os
import argparse

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from config import Config
from models.database import db


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def scrape_gls(year: int, dry_run: bool = False):
    """Run the GLS scraper for a given year."""
    from services.gls_scraper import scrape_gls_tenders
    from models.gls_tender import GLSTender

    app = create_app()

    with app.app_context():
        # Create tables if they don't exist
        db.create_all()

        print("=" * 60)
        print(f"GLS Scraper - Scraping URA Media Releases for {year}")
        print("=" * 60)

        if dry_run:
            print("DRY RUN MODE - No data will be saved")
            print("-" * 60)

        # Run scraper
        stats = scrape_gls_tenders(year=year, dry_run=dry_run)

        print("\n" + "=" * 60)
        print("SCRAPE COMPLETE")
        print("=" * 60)
        print(f"Releases found:     {stats['releases_found']}")
        print(f"Tenders parsed:     {stats['tenders_parsed']}")
        print(f"Tenders saved:      {stats['tenders_saved']}")
        print(f"Tenders updated:    {stats['tenders_updated']}")

        if stats['errors']:
            print(f"\nErrors ({len(stats['errors'])}):")
            for err in stats['errors'][:5]:  # Show first 5
                print(f"  - {err}")
            if len(stats['errors']) > 5:
                print(f"  ... and {len(stats['errors']) - 5} more")

        if stats['needs_review']:
            print(f"\nNeeds review ({len(stats['needs_review'])}):")
            for rid in stats['needs_review']:
                print(f"  - {rid}")

        # Show current totals
        print("\n" + "-" * 60)
        print("CURRENT DATABASE TOTALS:")
        launched = db.session.query(GLSTender).filter_by(status='launched').count()
        awarded = db.session.query(GLSTender).filter_by(status='awarded').count()
        print(f"  Launched (SIGNAL): {launched}")
        print(f"  Awarded (FACT):    {awarded}")
        print(f"  Total:             {launched + awarded}")
        print("=" * 60)


def show_stats():
    """Show current GLS database statistics."""
    from models.gls_tender import GLSTender
    from sqlalchemy import func

    app = create_app()

    with app.app_context():
        db.create_all()

        print("=" * 60)
        print("GLS DATABASE STATISTICS")
        print("=" * 60)

        # Count by status
        launched = db.session.query(GLSTender).filter_by(status='launched').count()
        awarded = db.session.query(GLSTender).filter_by(status='awarded').count()

        print(f"\nBy Status:")
        print(f"  Launched (SIGNAL): {launched}")
        print(f"  Awarded (FACT):    {awarded}")
        print(f"  Total:             {launched + awarded}")

        # Count by region
        print(f"\nBy Region:")
        region_stats = db.session.query(
            GLSTender.market_segment,
            GLSTender.status,
            func.count(GLSTender.id).label('count'),
            func.sum(GLSTender.estimated_units).label('units')
        ).group_by(GLSTender.market_segment, GLSTender.status).all()

        regions = {}
        for row in region_stats:
            region = row.market_segment or 'Unknown'
            if region not in regions:
                regions[region] = {'launched': 0, 'awarded': 0, 'units': 0}
            regions[region][row.status] = row.count
            regions[region]['units'] += int(row.units) if row.units else 0

        for region in ['CCR', 'RCR', 'OCR', 'Unknown']:
            if region in regions:
                r = regions[region]
                print(f"  {region}: {r['launched']} launched, {r['awarded']} awarded, ~{r['units']} units")

        # Needs review
        needs_review = db.session.query(GLSTender).filter_by(needs_review=True).count()
        if needs_review > 0:
            print(f"\n  Needs review: {needs_review}")

        # Date range
        date_range = db.session.query(
            func.min(GLSTender.release_date),
            func.max(GLSTender.release_date)
        ).first()

        if date_range[0]:
            print(f"\nDate Range:")
            print(f"  Earliest: {date_range[0]}")
            print(f"  Latest:   {date_range[1]}")

        print("=" * 60)


def list_tenders(status: str = None, limit: int = 10):
    """List recent tenders."""
    from models.gls_tender import GLSTender

    app = create_app()

    with app.app_context():
        db.create_all()

        query = db.session.query(GLSTender)
        if status:
            query = query.filter_by(status=status.lower())

        tenders = query.order_by(GLSTender.release_date.desc()).limit(limit).all()

        print("=" * 60)
        print(f"RECENT TENDERS ({len(tenders)} shown)")
        print("=" * 60)

        for t in tenders:
            status_label = "SIGNAL" if t.status == 'launched' else "FACT"
            region = t.market_segment or '???'
            units = t.estimated_units or '?'
            price = f"${t.tendered_price_sgd:,.0f}" if t.tendered_price_sgd else "N/A"

            print(f"\n[{t.release_id}] {status_label} | {region}")
            print(f"  Location: {t.location_raw}")
            print(f"  Date:     {t.release_date}")
            print(f"  Units:    ~{units}")
            if t.status == 'awarded':
                print(f"  Price:    {price}")
                if t.psf_ppr:
                    print(f"  PSF PPR:  ${t.psf_ppr:,.0f}")
                if t.successful_tenderer:
                    print(f"  Winner:   {t.successful_tenderer}")

        print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="GLS Scraper - Scrapes Government Land Sales data from URA"
    )

    parser.add_argument(
        "--year",
        type=int,
        default=2025,
        help="Year to scrape (default: 2025)"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview without saving to database"
    )

    parser.add_argument(
        "--stats",
        action="store_true",
        help="Show current database statistics"
    )

    parser.add_argument(
        "--list",
        nargs="?",
        const="all",
        metavar="STATUS",
        help="List recent tenders (optionally filter by 'launched' or 'awarded')"
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Limit for --list (default: 10)"
    )

    args = parser.parse_args()

    if args.stats:
        show_stats()
    elif args.list:
        status = args.list if args.list != "all" else None
        list_tenders(status=status, limit=args.limit)
    else:
        scrape_gls(year=args.year, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
