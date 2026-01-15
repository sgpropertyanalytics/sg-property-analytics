#!/usr/bin/env python3
"""
Backfill row_hash for CSV transactions.

This script computes row_hash for CSV records using the same canonicalization
logic as the URA API mapper, enabling shadow comparison between sources.

Key normalizations applied:
- transaction_month: Derived from transaction_date (first of month)
- floor_range: Normalized from "XX to YY" to "XX-YY" format
- project_name: Stripped and whitespace-collapsed to match URA
- All NATURAL_KEY_FIELDS use the same compute_row_hash() function

Rows missing transaction_date cannot be hashed and will remain NULL.
These are reported at the end for investigation.

Usage:
    python scripts/backfill_csv_row_hash.py --dry-run      # Preview changes
    python scripts/backfill_csv_row_hash.py                # Run backfill
    python scripts/backfill_csv_row_hash.py --validate-only  # Just validate
"""

import argparse
import logging
import sys
import time
import re
from datetime import date
from typing import List, Dict, Any, Optional, Tuple

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

BATCH_SIZE = 5000

# Import normalize_floor_range from shared location (single source of truth)
# This ensures CSV backfill and URA API mapper use identical normalization
from services.etl.fingerprint import normalize_floor_range


def canonicalize_project_name(name: Optional[str]) -> str:
    """Canonicalize project name: strip + collapse whitespace."""
    if not name:
        return ''
    name = str(name).strip()
    name = re.sub(r'\s+', ' ', name)
    return name


def derive_transaction_month(transaction_date: date) -> date:
    """Derive transaction_month (first of month) from transaction_date."""
    return transaction_date.replace(day=1)


def get_pending_count(session) -> int:
    """Get count of CSV records without row_hash."""
    from sqlalchemy import text
    result = session.execute(text("""
        SELECT COUNT(*)
        FROM transactions
        WHERE source = 'csv' AND row_hash IS NULL
    """)).fetchone()
    return result[0]


def get_hashable_pending_count(session) -> int:
    """Get count of CSV records that CAN be hashed (have transaction_date)."""
    from sqlalchemy import text
    result = session.execute(text("""
        SELECT COUNT(*)
        FROM transactions
        WHERE source = 'csv'
          AND row_hash IS NULL
          AND transaction_date IS NOT NULL
    """)).fetchone()
    return result[0]


def fetch_batch_with_seek(session, last_id: int, batch_size: int) -> List[Dict[str, Any]]:
    """Fetch batch using seek pagination for efficiency."""
    from sqlalchemy import text

    result = session.execute(text("""
        SELECT id, project_name, transaction_date, price, area_sqft,
               floor_range, sale_type, district
        FROM transactions
        WHERE source = 'csv'
          AND row_hash IS NULL
          AND id > :last_id
        ORDER BY id
        LIMIT :batch_size
    """), {'last_id': last_id, 'batch_size': batch_size}).fetchall()

    return [{
        'id': row[0], 'project_name': row[1], 'transaction_date': row[2],
        'price': row[3], 'area_sqft': row[4], 'floor_range': row[5],
        'sale_type': row[6], 'district': row[7],
    } for row in result]


def compute_batch_hashes(rows: List[Dict[str, Any]]) -> Tuple[List[Tuple[str, int]], List[int]]:
    """Compute row_hash for batch. Returns (updates, skipped_ids)."""
    from services.etl.fingerprint import compute_row_hash
    from services.ura_canonical_mapper import NATURAL_KEY_FIELDS

    updates = []
    skipped_ids = []

    for row in rows:
        if not row['transaction_date']:
            skipped_ids.append(row['id'])
            continue

        canonical = {
            'project_name': canonicalize_project_name(row['project_name']),
            'transaction_month': derive_transaction_month(row['transaction_date']),
            'price': row['price'],
            'area_sqft': row['area_sqft'],
            'floor_range': normalize_floor_range(row['floor_range']),
            'sale_type': row['sale_type'],
            'district': row['district'],
        }

        row_hash = compute_row_hash(canonical, NATURAL_KEY_FIELDS)
        updates.append((row_hash, row['id']))

    return updates, skipped_ids


def apply_batch_updates(session, updates: List[Tuple[str, int]], dry_run: bool = False) -> int:
    """Apply row_hash updates to database using fast bulk update."""
    from psycopg2.extras import execute_values

    if not updates or dry_run:
        return len(updates)

    # Get raw psycopg2 connection for fast execute_values
    conn = session.connection().connection
    cur = conn.cursor()

    # Set longer statement timeout for bulk updates
    cur.execute("SET LOCAL statement_timeout = '120s'")

    # Use execute_values with UPDATE-FROM-VALUES pattern (much faster than executemany)
    execute_values(
        cur,
        """
        UPDATE transactions t SET row_hash = v.hash
        FROM (VALUES %s) AS v(hash, id)
        WHERE t.id = v.id
        """,
        updates,
        page_size=500
    )
    session.commit()
    return len(updates)


def update_transaction_month_batch(session, dry_run: bool = False) -> int:
    """Update transaction_month for CSV records where NULL."""
    from sqlalchemy import text

    if dry_run:
        result = session.execute(text("""
            SELECT COUNT(*) FROM transactions
            WHERE source = 'csv' AND transaction_month IS NULL AND transaction_date IS NOT NULL
        """)).fetchone()
        return result[0]

    result = session.execute(text("""
        UPDATE transactions
        SET transaction_month = DATE_TRUNC('month', transaction_date)::date
        WHERE source = 'csv' AND transaction_month IS NULL AND transaction_date IS NOT NULL
    """))
    session.commit()
    return result.rowcount


def normalize_floor_range_in_db(session, dry_run: bool = False) -> int:
    """Normalize floor_range format in database."""
    from sqlalchemy import text

    if dry_run:
        result = session.execute(text("""
            SELECT COUNT(*) FROM transactions
            WHERE source = 'csv'
              AND (floor_range ~ '^\\d+\\s+to\\s+\\d+$'
                   OR floor_range ~ '^\\d+\\s+-\\s+\\d+$'
                   OR floor_range ~ '^B\\d+\\s+to\\s+B\\d+$'
                   OR floor_range LIKE '%–%' OR floor_range LIKE '%—%')
        """)).fetchone()
        return result[0]

    total = 0

    # Replace en-dash/em-dash
    result = session.execute(text("""
        UPDATE transactions
        SET floor_range = REPLACE(REPLACE(floor_range, '–', '-'), '—', '-')
        WHERE source = 'csv' AND (floor_range LIKE '%–%' OR floor_range LIKE '%—%')
    """))
    total += result.rowcount

    # "XX to YY" -> "XX-YY"
    result = session.execute(text("""
        UPDATE transactions
        SET floor_range = REGEXP_REPLACE(floor_range, '^(\\d+)\\s+to\\s+(\\d+)$', '\\1-\\2', 'i')
        WHERE source = 'csv' AND floor_range ~* '^\\d+\\s+to\\s+\\d+$'
    """))
    total += result.rowcount

    # "XX - YY" -> "XX-YY"
    result = session.execute(text("""
        UPDATE transactions
        SET floor_range = REGEXP_REPLACE(floor_range, '^(\\d+)\\s+-\\s+(\\d+)$', '\\1-\\2')
        WHERE source = 'csv' AND floor_range ~ '^\\d+\\s+-\\s+\\d+$'
    """))
    total += result.rowcount

    # Basement floors
    result = session.execute(text("""
        UPDATE transactions
        SET floor_range = UPPER(REGEXP_REPLACE(floor_range, '^(B\\d+)\\s+to\\s+(B\\d+)$', '\\1-\\2', 'i'))
        WHERE source = 'csv' AND floor_range ~* '^B\\d+\\s+to\\s+B\\d+$'
    """))
    total += result.rowcount

    session.commit()
    return total


def normalize_project_names_in_db(session, dry_run: bool = False) -> int:
    """Normalize project names - collapse internal whitespace."""
    from sqlalchemy import text

    if dry_run:
        result = session.execute(text("""
            SELECT COUNT(*) FROM transactions
            WHERE source = 'csv' AND project_name ~ '\\s{2,}'
        """)).fetchone()
        return result[0]

    result = session.execute(text("""
        UPDATE transactions
        SET project_name = REGEXP_REPLACE(TRIM(project_name), '\\s+', ' ', 'g')
        WHERE source = 'csv' AND project_name ~ '\\s{2,}'
    """))
    session.commit()
    return result.rowcount


def report_remaining_nulls(session):
    """Report rows that still have NULL row_hash after backfill."""
    from sqlalchemy import text

    result = session.execute(text("""
        SELECT COUNT(*) FROM transactions WHERE source = 'csv' AND row_hash IS NULL
    """)).fetchone()

    remaining = result[0]
    if remaining == 0:
        logger.info("\n  All CSV rows now have row_hash!")
        return

    logger.warning(f"\n  {remaining:,} CSV rows still have NULL row_hash (un-hashable)")

    result = session.execute(text("""
        SELECT
            CASE
                WHEN transaction_date IS NULL THEN 'missing transaction_date'
                WHEN price IS NULL THEN 'missing price'
                WHEN area_sqft IS NULL THEN 'missing area_sqft'
                ELSE 'unknown reason'
            END as reason,
            COUNT(*) as cnt
        FROM transactions
        WHERE source = 'csv' AND row_hash IS NULL
        GROUP BY 1 ORDER BY cnt DESC
    """)).fetchall()

    logger.warning("  Breakdown:")
    for row in result:
        logger.warning(f"    - {row[0]}: {row[1]:,}")

    sample = session.execute(text("""
        SELECT id, project_name, transaction_date
        FROM transactions
        WHERE source = 'csv' AND row_hash IS NULL
        LIMIT 5
    """)).fetchall()

    logger.warning("  Sample IDs for investigation:")
    for row in sample:
        logger.warning(f"    ID {row[0]}: '{row[1][:30] if row[1] else None}' date={row[2]}")


def run_backfill(dry_run: bool = False):
    """Run the backfill process."""
    from app import create_app
    from models.database import db

    logger.info("=" * 60)
    logger.info("CSV Row Hash Backfill")
    logger.info("=" * 60)
    if dry_run:
        logger.info("*** DRY RUN MODE ***")

    app = create_app()

    with app.app_context():
        session = db.session

        # Step 1: Normalize project names
        logger.info("\nStep 1: Normalizing project names...")
        name_count = normalize_project_names_in_db(session, dry_run)
        logger.info(f"  {'Would normalize' if dry_run else 'Normalized'} {name_count} rows")

        # Step 2: Update transaction_month
        logger.info("\nStep 2: Populating transaction_month...")
        month_count = update_transaction_month_batch(session, dry_run)
        logger.info(f"  {'Would update' if dry_run else 'Updated'} {month_count} rows")

        # Step 3: Skip in-DB floor_range normalization (can cause unique constraint violations)
        # Floor range is normalized at hash computation time instead
        logger.info("\nStep 3: Floor range normalization (at hash time only)")
        logger.info("  Skipping in-DB normalization to avoid unique constraint violations")

        # Step 4: Compute row_hash
        logger.info("\nStep 4: Computing row_hash...")

        total_pending = get_pending_count(session)
        hashable_pending = get_hashable_pending_count(session)
        unhashable = total_pending - hashable_pending

        logger.info(f"  Total pending: {total_pending:,}")
        logger.info(f"  Hashable (have transaction_date): {hashable_pending:,}")
        if unhashable > 0:
            logger.info(f"  Un-hashable (missing date): {unhashable:,}")

        if hashable_pending == 0:
            logger.info("  Nothing to hash!")
            if not dry_run:
                report_remaining_nulls(session)
            return

        total_updated = 0
        total_skipped = 0
        first_skipped_ids = []
        batch_num = 0
        last_id = 0
        start_time = time.time()

        while True:
            batch_num += 1
            batch_start = time.time()

            rows = fetch_batch_with_seek(session, last_id, BATCH_SIZE)
            if not rows:
                break

            last_id = rows[-1]['id']
            updates, skipped_ids = compute_batch_hashes(rows)

            # Track first 20 skipped IDs for debugging
            if len(first_skipped_ids) < 20:
                first_skipped_ids.extend(skipped_ids[:20 - len(first_skipped_ids)])
            total_skipped += len(skipped_ids)

            updated = apply_batch_updates(session, updates, dry_run)
            total_updated += updated

            batch_elapsed = time.time() - batch_start
            rows_per_sec = len(rows) / batch_elapsed if batch_elapsed > 0 else 0

            # Progress based on hashable rows only
            pct = (total_updated / hashable_pending) * 100 if hashable_pending > 0 else 100
            skip_note = f" (skipped {len(skipped_ids)})" if skipped_ids else ""
            logger.info(
                f"  Batch {batch_num}: {updated:,} rows{skip_note} "
                f"({batch_elapsed:.1f}s, {rows_per_sec:.0f}/s) "
                f"- {total_updated:,}/{hashable_pending:,} ({pct:.1f}%)"
            )

        elapsed = time.time() - start_time
        logger.info(f"\nBackfill complete!")
        logger.info(f"  Rows hashed: {total_updated:,}")
        logger.info(f"  Rows skipped (un-hashable): {total_skipped:,}")
        logger.info(f"  Time: {elapsed:.1f}s ({total_updated / elapsed:.0f} rows/s)" if elapsed > 0 else "")

        if first_skipped_ids:
            logger.info(f"  First skipped IDs: {first_skipped_ids}")

        if not dry_run:
            report_remaining_nulls(session)


def run_validation():
    """Validate backfill results with clear metrics."""
    from app import create_app
    from models.database import db
    from sqlalchemy import text

    logger.info("\n" + "=" * 60)
    logger.info("Validation")
    logger.info("=" * 60)

    app = create_app()

    with app.app_context():
        session = db.session

        # 1. Coverage by source
        result = session.execute(text("""
            SELECT source, COUNT(*) as total, COUNT(row_hash) as with_hash,
                   ROUND(COUNT(row_hash)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as pct
            FROM transactions GROUP BY source ORDER BY source
        """)).fetchall()

        logger.info("\n1. Row hash coverage by source:")
        for row in result:
            logger.info(f"  {row[0]:<10}: {row[2]:>8,}/{row[1]:>8,} ({row[3]}%)")

        # 2. Hash collision stats (within each source)
        collision_stats = session.execute(text("""
            SELECT
                source,
                COUNT(DISTINCT row_hash) as distinct_hashes,
                COUNT(*) FILTER (WHERE cnt > 1) as collision_groups,
                MAX(cnt) as max_multiplicity
            FROM (
                SELECT source, row_hash, COUNT(*) as cnt
                FROM transactions
                WHERE row_hash IS NOT NULL
                GROUP BY source, row_hash
            ) grouped
            GROUP BY source ORDER BY source
        """)).fetchall()

        logger.info("\n2. Hash collision stats (within source):")
        for row in collision_stats:
            logger.info(f"  {row[0]:<10}: {row[1]:>8,} distinct hashes, "
                       f"{row[2]:>6,} collision groups, max={row[3]}")

        # 3. Cross-source matching
        result = session.execute(text("""
            SELECT COUNT(*) FROM (
                SELECT DISTINCT row_hash FROM transactions WHERE source = 'csv' AND row_hash IS NOT NULL
            ) csv_h
            INNER JOIN (
                SELECT DISTINCT row_hash FROM transactions WHERE source = 'ura_api' AND row_hash IS NOT NULL
            ) api_h ON csv_h.row_hash = api_h.row_hash
        """)).fetchone()

        logger.info(f"\n3. Cross-source matching:")
        logger.info(f"  Matching hashes (CSV ∩ URA API): {result[0]:,}")

        if result[0] > 0:
            # Cross-source collision stats
            cross_stats = session.execute(text("""
                SELECT
                    COUNT(*) as total_pairs,
                    COUNT(*) FILTER (WHERE csv_cnt > 1 OR api_cnt > 1) as ambiguous_pairs,
                    MAX(csv_cnt + api_cnt) as max_cross_multiplicity
                FROM (
                    SELECT
                        row_hash,
                        COUNT(*) FILTER (WHERE source = 'csv') as csv_cnt,
                        COUNT(*) FILTER (WHERE source = 'ura_api') as api_cnt
                    FROM transactions
                    WHERE row_hash IS NOT NULL
                    GROUP BY row_hash
                    HAVING COUNT(*) FILTER (WHERE source = 'csv') > 0
                       AND COUNT(*) FILTER (WHERE source = 'ura_api') > 0
                ) matched
            """)).fetchone()

            logger.info(f"  Total join pairs: {cross_stats[0]:,}")
            logger.info(f"  Ambiguous (1-to-many): {cross_stats[1]:,}")
            logger.info(f"  Max cross-source multiplicity: {cross_stats[2]}")

            # 4. Sample matched records
            sample = session.execute(text("""
                SELECT c.project_name, a.project_name, c.transaction_month, a.transaction_month,
                       c.price, a.price, c.floor_range, a.floor_range, c.row_hash
                FROM transactions c
                JOIN transactions a ON c.row_hash = a.row_hash
                WHERE c.source = 'csv' AND a.source = 'ura_api'
                LIMIT 5
            """)).fetchall()

            logger.info("\n4. Sample matched records:")
            for i, row in enumerate(sample, 1):
                logger.info(f"  {i}. Project: '{row[0]}' vs '{row[1]}'")
                logger.info(f"     Month: {row[2]} vs {row[3]}, Price: {row[4]:,.0f} vs {row[5]:,.0f}")
                logger.info(f"     Floor: '{row[6]}' vs '{row[7]}', Hash: {row[8][:16]}...")

            # 5. Quality check on price/month
            mismatch = session.execute(text("""
                SELECT COUNT(*) FROM transactions c
                JOIN transactions a ON c.row_hash = a.row_hash
                WHERE c.source = 'csv' AND a.source = 'ura_api'
                  AND (c.price != a.price OR c.transaction_month != a.transaction_month)
            """)).fetchone()

            logger.info("\n5. Quality check (price/month consistency):")
            if mismatch[0] > 0:
                logger.warning(f"  WARNING: {mismatch[0]} hash collisions (different price/month)!")
            else:
                logger.info("  PASSED - all matched pairs have consistent price/month")
        else:
            logger.warning("\nNo matching hashes! Investigating...")
            date_check = session.execute(text("""
                SELECT source, MIN(transaction_month), MAX(transaction_month)
                FROM transactions WHERE row_hash IS NOT NULL AND transaction_month IS NOT NULL
                GROUP BY source
            """)).fetchall()
            logger.warning("Date ranges:")
            for row in date_check:
                logger.warning(f"  {row[0]}: {row[1]} to {row[2]}")


def run_comparison():
    """Run shadow comparison using existing URAShadowComparator."""
    from app import create_app
    from models.database import db
    from services.ura_shadow_comparator import URAShadowComparator

    logger.info("\n" + "=" * 60)
    logger.info("Shadow Comparison (CSV vs URA API)")
    logger.info("=" * 60)

    app = create_app()

    with app.app_context():
        engine = db.engine
        comparator = URAShadowComparator(engine)

        # Compare all API data against all CSV data
        report = comparator.compare_api_vs_csv()

        # Print summary
        logger.info("\n1. Row Counts:")
        logger.info(f"  CSV (baseline):  {report.baseline_row_count:,}")
        logger.info(f"  URA API:         {report.current_row_count:,}")
        logger.info(f"  Diff:            {report.row_count_diff:+,} ({report.row_count_diff_pct:+.1f}%)")

        logger.info("\n2. Coverage:")
        logger.info(f"  Matched:         {report.coverage_pct:.1f}%")
        logger.info(f"  Missing in API:  {report.missing_in_current:,}")
        logger.info(f"  Missing in CSV:  {report.missing_in_baseline:,}")
        logger.info(f"  Ambiguous (1-to-many): {report.ambiguous_matches:,}")
        logger.info(f"  Max multiplicity: {report.max_multiplicity}")

        # Show top PSF diffs by month (last 6 months)
        if report.psf_median_by_month:
            logger.info("\n3. PSF Median Diffs (by month):")
            sorted_months = sorted(report.psf_median_by_month.keys(), reverse=True)[:6]
            for month in sorted_months:
                data = report.psf_median_by_month[month]
                if data.get('diff_pct') is not None:
                    logger.info(f"  {month}: {data['diff_pct']:+.1f}%")

        # Show top mismatches
        if report.top_mismatches:
            logger.info(f"\n4. Top Mismatches ({len(report.top_mismatches)} shown):")
            for i, m in enumerate(report.top_mismatches[:5], 1):
                logger.info(f"  {i}. {m['project_name']} ({m['district']}) - {m['transaction_month']}")

        # Assessment
        logger.info("\n" + "=" * 60)
        if report.is_acceptable:
            logger.info("RESULT: PASSED - All thresholds met")
        else:
            logger.warning("RESULT: FAILED - Issues found:")
            for issue in report.issues:
                logger.warning(f"  - {issue}")
        logger.info("=" * 60)

        return 0 if report.is_acceptable else 1


def main():
    parser = argparse.ArgumentParser(description='Backfill row_hash for CSV transactions')
    parser.add_argument('--dry-run', action='store_true', help='Preview without changes')
    parser.add_argument('--validate-only', action='store_true', help='Only validate backfill')
    parser.add_argument('--compare', action='store_true', help='Run shadow comparison (CSV vs API)')
    args = parser.parse_args()

    try:
        if args.compare:
            sys.exit(run_comparison())
        elif args.validate_only:
            run_validation()
        else:
            run_backfill(dry_run=args.dry_run)
            if not args.dry_run:
                run_validation()
    except KeyboardInterrupt:
        logger.info("\nInterrupted. Re-run to resume.")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
