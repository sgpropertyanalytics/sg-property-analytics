#!/usr/bin/env python3
"""
migrate_project_units.py - Populate project_units table from CSV + transactions

This script performs a two-phase migration:

Phase 1: Import from CSV (new_launch_units.csv)
    - Load all projects from CSV
    - Normalize names and generate project_key
    - Insert with units_status='verified' if total_units present

Phase 2: Discover from transactions
    - Query all distinct projects from transactions table
    - Add any projects not already in registry
    - Insert with units_status='unknown' (no unit data)

Features:
    - Idempotent: Can run multiple times safely (uses UPSERT logic)
    - Dry-run mode: Preview changes without committing
    - Collision detection: Logs when two raw names map to same key
    - Audit trail: Prints summary of actions taken

Usage:
    # Dry run (preview without changes)
    python scripts/migrate_project_units.py --dry-run

    # Full migration
    python scripts/migrate_project_units.py

    # CSV only (skip transaction discovery)
    python scripts/migrate_project_units.py --csv-only

    # Transactions only (skip CSV import)
    python scripts/migrate_project_units.py --transactions-only

Prerequisites:
    1. Run SQL migration first: backend/migrations/020_create_project_units.sql
    2. Set DATABASE_URL environment variable
"""

import os
import sys
import csv
import argparse
import logging
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# Add backend to path
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# Paths
CSV_PATH = BACKEND_DIR / "data" / "new_launch_units.csv"

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger('migrate_project_units')


def create_app_context():
    """Create Flask app context for database access."""
    from app import create_app
    app = create_app()
    return app.app_context()


def phase1_import_csv(dry_run: bool = False) -> dict:
    """
    Phase 1: Import projects from CSV file.

    Returns:
        Dict with stats: created, updated, skipped, collisions, errors
    """
    from data_health.core import normalize_name, project_key
    from models import ProjectUnits, db
    from models.project_units import UNITS_STATUS_VERIFIED, UNITS_STATUS_UNKNOWN

    logger.info("=" * 70)
    logger.info("PHASE 1: Import from CSV")
    logger.info("=" * 70)
    logger.info(f"Source: {CSV_PATH}")

    stats = {
        'created': 0,
        'updated': 0,
        'skipped': 0,
        'collisions': [],
        'errors': [],
    }

    # Track keys to detect collisions
    seen_keys = {}  # key -> raw_name

    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    logger.info(f"Loaded {len(rows)} rows from CSV")

    for row_num, row in enumerate(rows, start=2):
        raw_name = row.get('project_name', '').strip()
        if not raw_name:
            stats['skipped'] += 1
            continue

        try:
            key = project_key(raw_name)
            canonical = normalize_name(raw_name)

            # Check for collision
            if key in seen_keys and seen_keys[key] != raw_name:
                stats['collisions'].append({
                    'key': key,
                    'name1': seen_keys[key],
                    'name2': raw_name,
                })
            seen_keys[key] = raw_name

            # Parse fields
            total_units = None
            if row.get('total_units') and row['total_units'].strip():
                try:
                    total_units = int(row['total_units'])
                except ValueError:
                    pass

            top_year = None
            if row.get('top') and row['top'].strip():
                try:
                    top_year = int(row['top'])
                except ValueError:
                    pass

            # Check if exists
            existing = ProjectUnits.query.filter_by(project_key=key).first()

            if existing:
                # Update existing record
                updated = False
                if total_units and (not existing.total_units or existing.data_source == 'transactions'):
                    existing.total_units = total_units
                    existing.units_status = UNITS_STATUS_VERIFIED
                    existing.confidence_score = 0.9
                    updated = True
                if row.get('district') and not existing.district:
                    existing.district = row['district']
                    updated = True
                if row.get('developer') and not existing.developer:
                    existing.developer = row['developer']
                    updated = True
                if row.get('tenure') and not existing.tenure:
                    existing.tenure = row['tenure']
                    updated = True
                if top_year and not existing.top_year:
                    existing.top_year = top_year
                    updated = True
                if row.get('source'):
                    existing.data_source = row['source']

                if updated:
                    stats['updated'] += 1
                else:
                    stats['skipped'] += 1
            else:
                # Create new record
                new_project = ProjectUnits(
                    project_key=key,
                    project_name_raw=raw_name,
                    project_name_canonical=canonical,
                    district=row.get('district') or None,
                    total_units=total_units,
                    units_status=UNITS_STATUS_VERIFIED if total_units else UNITS_STATUS_UNKNOWN,
                    developer=row.get('developer') or None,
                    tenure=row.get('tenure') or None,
                    top_year=top_year,
                    data_source=row.get('source') or 'csv',
                    confidence_score=0.9 if total_units else None,
                )
                db.session.add(new_project)
                stats['created'] += 1

        except Exception as e:
            stats['errors'].append({
                'row': row_num,
                'name': raw_name,
                'error': str(e),
            })
            logger.error(f"Row {row_num} ({raw_name}): {e}")

    if dry_run:
        db.session.rollback()
        logger.info("DRY RUN - changes rolled back")
    else:
        db.session.commit()
        logger.info("Changes committed")

    # Print summary
    logger.info(f"\nPhase 1 Summary:")
    logger.info(f"  Created: {stats['created']}")
    logger.info(f"  Updated: {stats['updated']}")
    logger.info(f"  Skipped: {stats['skipped']}")
    logger.info(f"  Errors:  {len(stats['errors'])}")

    if stats['collisions']:
        logger.warning(f"\n  Collisions detected ({len(stats['collisions'])}):")
        for c in stats['collisions'][:10]:
            logger.warning(f"    Key '{c['key']}': '{c['name1']}' vs '{c['name2']}'")

    return stats


def phase2_discover_transactions(dry_run: bool = False) -> dict:
    """
    Phase 2: Discover projects from transactions table.

    Adds projects that exist in transactions but not yet in registry.
    These are added with units_status='unknown'.

    Returns:
        Dict with stats: created, skipped, errors
    """
    from sqlalchemy import text
    from data_health.core import normalize_name, project_key
    from models import ProjectUnits, db
    from models.project_units import UNITS_STATUS_UNKNOWN

    logger.info("\n" + "=" * 70)
    logger.info("PHASE 2: Discover from Transactions")
    logger.info("=" * 70)

    stats = {
        'created': 0,
        'skipped': 0,
        'errors': [],
    }

    # Get all existing keys
    existing_keys = {p.project_key for p in ProjectUnits.query.all()}
    logger.info(f"Registry has {len(existing_keys)} projects")

    # Query distinct projects from transactions
    query = text("""
        SELECT
            project_name,
            district,
            COUNT(*) as tx_count
        FROM transactions
        WHERE COALESCE(is_outlier, false) = false
          AND project_name IS NOT NULL
        GROUP BY project_name, district
        ORDER BY COUNT(*) DESC
    """)

    rows = db.session.execute(query).fetchall()
    logger.info(f"Found {len(rows)} distinct projects in transactions")

    for row in rows:
        raw_name = row[0]
        district = row[1]
        tx_count = row[2]

        try:
            key = project_key(raw_name)
            canonical = normalize_name(raw_name)

            if key in existing_keys:
                stats['skipped'] += 1
                continue

            # Create new record with unknown units
            new_project = ProjectUnits(
                project_key=key,
                project_name_raw=raw_name,
                project_name_canonical=canonical,
                district=district,
                total_units=None,
                units_status=UNITS_STATUS_UNKNOWN,
                data_source='transactions',
            )
            db.session.add(new_project)
            existing_keys.add(key)  # Track to avoid duplicates within this run
            stats['created'] += 1

        except Exception as e:
            stats['errors'].append({
                'name': raw_name,
                'error': str(e),
            })
            logger.error(f"Project '{raw_name}': {e}")

    if dry_run:
        db.session.rollback()
        logger.info("DRY RUN - changes rolled back")
    else:
        db.session.commit()
        logger.info("Changes committed")

    # Print summary
    logger.info(f"\nPhase 2 Summary:")
    logger.info(f"  Created: {stats['created']}")
    logger.info(f"  Skipped (already exists): {stats['skipped']}")
    logger.info(f"  Errors: {len(stats['errors'])}")

    return stats


def print_final_summary(phase1_stats: dict, phase2_stats: dict):
    """Print final migration summary."""
    from models import ProjectUnits
    from models.project_units import UNITS_STATUS_VERIFIED, UNITS_STATUS_UNKNOWN

    logger.info("\n" + "=" * 70)
    logger.info("MIGRATION COMPLETE")
    logger.info("=" * 70)

    # Query final state
    total = ProjectUnits.query.count()
    verified = ProjectUnits.query.filter_by(units_status=UNITS_STATUS_VERIFIED).count()
    unknown = ProjectUnits.query.filter_by(units_status=UNITS_STATUS_UNKNOWN).count()

    logger.info(f"\nFinal Registry State:")
    logger.info(f"  Total projects:    {total:,}")
    logger.info(f"  With units:        {verified:,} ({100*verified/total:.1f}%)" if total > 0 else "  With units: 0")
    logger.info(f"  Units unknown:     {unknown:,} ({100*unknown/total:.1f}%)" if total > 0 else "  Units unknown: 0")

    # Phase summaries
    logger.info(f"\nPhase 1 (CSV Import):")
    logger.info(f"  Created: {phase1_stats.get('created', 0)}, Updated: {phase1_stats.get('updated', 0)}")

    logger.info(f"\nPhase 2 (Transaction Discovery):")
    logger.info(f"  Created: {phase2_stats.get('created', 0)}, Skipped: {phase2_stats.get('skipped', 0)}")

    # Errors
    total_errors = len(phase1_stats.get('errors', [])) + len(phase2_stats.get('errors', []))
    if total_errors > 0:
        logger.warning(f"\nTotal errors: {total_errors}")


def main():
    parser = argparse.ArgumentParser(
        description="Migrate project data to project_units table"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without committing"
    )
    parser.add_argument(
        "--csv-only",
        action="store_true",
        help="Only run Phase 1 (CSV import)"
    )
    parser.add_argument(
        "--transactions-only",
        action="store_true",
        help="Only run Phase 2 (transaction discovery)"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    logger.info("=" * 70)
    logger.info("PROJECT UNITS MIGRATION")
    logger.info(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if args.dry_run:
        logger.info("MODE: DRY RUN (no changes will be committed)")
    logger.info("=" * 70)

    phase1_stats = {'created': 0, 'updated': 0, 'skipped': 0, 'errors': []}
    phase2_stats = {'created': 0, 'skipped': 0, 'errors': []}

    with create_app_context():
        # Phase 1: CSV Import
        if not args.transactions_only:
            phase1_stats = phase1_import_csv(dry_run=args.dry_run)

        # Phase 2: Transaction Discovery
        if not args.csv_only:
            phase2_stats = phase2_discover_transactions(dry_run=args.dry_run)

        # Final summary
        if not args.dry_run:
            print_final_summary(phase1_stats, phase2_stats)
        else:
            logger.info("\n" + "=" * 70)
            logger.info("DRY RUN COMPLETE - No changes made")
            logger.info("=" * 70)
            logger.info(f"Would create from CSV: {phase1_stats.get('created', 0)}")
            logger.info(f"Would update from CSV: {phase1_stats.get('updated', 0)}")
            logger.info(f"Would create from transactions: {phase2_stats.get('created', 0)}")


if __name__ == "__main__":
    main()
