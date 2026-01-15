#!/usr/bin/env python3
"""
Diagnostic script for URA sync coverage issues.

Runs 3 checks on "half-returned" projects to identify why coverage < 95%:
1. Compare min/max contractDate distributions between CSV and URA API
2. Count transactions by contractDate month to identify cap vs window issues
3. Check if missing rows cluster by typeOfSale/floorRange/unit bundles

Usage:
    # With production DATABASE_URL
    DATABASE_URL=postgresql://... python scripts/diagnose_ura_sync_coverage.py

    # Or on Render console
    python scripts/diagnose_ura_sync_coverage.py
"""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from sqlalchemy import text


def run_diagnostic_1(sample_project: str = None):
    """Check 1: Compare min/max contractDate distributions for lowest coverage projects."""
    print("\n" + "=" * 110)
    print("DIAGNOSTIC CHECK 1: Projects with lowest coverage (min/max contract_date comparison)")
    print("=" * 110)

    query = text("""
        WITH csv_counts AS (
            SELECT project_name, COUNT(*) as csv_count,
                   MIN(contract_date) as csv_min_date,
                   MAX(contract_date) as csv_max_date
            FROM transactions
            WHERE source = 'csv' AND project_name IS NOT NULL
            GROUP BY project_name
        ),
        api_counts AS (
            SELECT project_name, COUNT(*) as api_count,
                   MIN(contract_date) as api_min_date,
                   MAX(contract_date) as api_max_date
            FROM transactions
            WHERE source = 'ura_api' AND project_name IS NOT NULL
            GROUP BY project_name
        )
        SELECT
            c.project_name,
            c.csv_count,
            COALESCE(a.api_count, 0) as api_count,
            ROUND(COALESCE(a.api_count, 0)::numeric / NULLIF(c.csv_count, 0) * 100, 1) as coverage_pct,
            c.csv_min_date,
            c.csv_max_date,
            a.api_min_date,
            a.api_max_date
        FROM csv_counts c
        LEFT JOIN api_counts a ON c.project_name = a.project_name
        WHERE c.csv_count > 50
        ORDER BY coverage_pct ASC NULLS FIRST
        LIMIT 20
    """)

    results = db.session.execute(query).fetchall()

    if not results:
        print("No projects found with >50 transactions")
        return []

    print(f"{'Project':<40} {'CSV#':>6} {'API#':>6} {'Cov%':>6} {'CSV Min':>10} {'CSV Max':>10} {'API Min':>10} {'API Max':>10}")
    print("-" * 110)

    half_returned = []
    for row in results:
        coverage = row[3] or 0
        print(f"{row[0][:39]:<40} {row[1]:>6} {row[2]:>6} {coverage:>6.1f} {str(row[4] or 'N/A'):>10} {str(row[5] or 'N/A'):>10} {str(row[6] or 'N/A'):>10} {str(row[7] or 'N/A'):>10}")

        # Track half-returned projects (30-70% coverage)
        if 30 <= coverage <= 70:
            half_returned.append(row[0])

    return half_returned


def run_diagnostic_2(projects: list):
    """Check 2: Count transactions by contractDate month to identify caps/windows."""
    print("\n" + "=" * 110)
    print("DIAGNOSTIC CHECK 2: Transactions by contract_date month (cap vs window analysis)")
    print("=" * 110)

    if not projects:
        projects = ['SPRINGLEAF RESIDENCE']  # Default sample

    for project_name in projects[:5]:  # Limit to 5 projects
        print(f"\n--- {project_name} ---")

        query = text("""
            SELECT
                contract_date,
                SUM(CASE WHEN source = 'csv' THEN 1 ELSE 0 END) as csv_count,
                SUM(CASE WHEN source = 'ura_api' THEN 1 ELSE 0 END) as api_count
            FROM transactions
            WHERE project_name = :project_name
            GROUP BY contract_date
            ORDER BY contract_date
        """)

        results = db.session.execute(query, {"project_name": project_name}).fetchall()

        if not results:
            print(f"  No transactions found for {project_name}")
            continue

        print(f"  {'Month':<10} {'CSV':>6} {'API':>6} {'Diff':>6} {'Notes'}")
        print("  " + "-" * 50)

        for row in results:
            csv_count = row[1] or 0
            api_count = row[2] or 0
            diff = csv_count - api_count

            # Flag potential issues
            notes = ""
            if api_count == 0 and csv_count > 0:
                notes = "⚠️  API returned 0 (window cutoff?)"
            elif diff > 10:
                notes = f"⚠️  Missing {diff} txns"

            print(f"  {row[0]:<10} {csv_count:>6} {api_count:>6} {diff:>6} {notes}")


def run_diagnostic_3(projects: list):
    """Check 3: Identify if missing rows cluster by typeOfSale/floorRange/unit bundles."""
    print("\n" + "=" * 110)
    print("DIAGNOSTIC CHECK 3: Missing row patterns (typeOfSale/floorRange clustering)")
    print("=" * 110)

    if not projects:
        projects = ['SPRINGLEAF RESIDENCE']

    for project_name in projects[:3]:  # Limit to 3 projects
        print(f"\n--- {project_name} ---")

        # Check by sale_type
        query_sale_type = text("""
            SELECT
                sale_type,
                SUM(CASE WHEN source = 'csv' THEN 1 ELSE 0 END) as csv_count,
                SUM(CASE WHEN source = 'ura_api' THEN 1 ELSE 0 END) as api_count,
                SUM(CASE WHEN source = 'csv' THEN 1 ELSE 0 END) -
                SUM(CASE WHEN source = 'ura_api' THEN 1 ELSE 0 END) as diff
            FROM transactions
            WHERE project_name = :project_name
            GROUP BY sale_type
            ORDER BY diff DESC
        """)

        results = db.session.execute(query_sale_type, {"project_name": project_name}).fetchall()

        print("\n  By Sale Type:")
        print(f"  {'Type':<20} {'CSV':>6} {'API':>6} {'Diff':>6}")
        print("  " + "-" * 40)
        for row in results:
            print(f"  {str(row[0] or 'N/A'):<20} {row[1]:>6} {row[2]:>6} {row[3]:>6}")

        # Check by floor_range
        query_floor = text("""
            SELECT
                floor_range,
                SUM(CASE WHEN source = 'csv' THEN 1 ELSE 0 END) as csv_count,
                SUM(CASE WHEN source = 'ura_api' THEN 1 ELSE 0 END) as api_count,
                SUM(CASE WHEN source = 'csv' THEN 1 ELSE 0 END) -
                SUM(CASE WHEN source = 'ura_api' THEN 1 ELSE 0 END) as diff
            FROM transactions
            WHERE project_name = :project_name
            GROUP BY floor_range
            ORDER BY diff DESC
            LIMIT 10
        """)

        results = db.session.execute(query_floor, {"project_name": project_name}).fetchall()

        print("\n  By Floor Range (top 10 by diff):")
        print(f"  {'Floor Range':<15} {'CSV':>6} {'API':>6} {'Diff':>6}")
        print("  " + "-" * 40)
        for row in results:
            print(f"  {str(row[0] or 'N/A'):<15} {row[1]:>6} {row[2]:>6} {row[3]:>6}")


def run_hash_sample_check():
    """Bonus: Sample 5 transactions and compare CSV vs API hash components."""
    print("\n" + "=" * 110)
    print("BONUS CHECK: Sample row hash comparison (CSV vs API)")
    print("=" * 110)

    query = text("""
        WITH csv_sample AS (
            SELECT project_name, contract_date, price, area_sqft, floor_range, sale_type, district
            FROM transactions
            WHERE source = 'csv'
            LIMIT 5
        )
        SELECT
            c.project_name,
            c.contract_date as csv_date,
            a.contract_date as api_date,
            c.price as csv_price,
            a.price as api_price,
            c.area_sqft as csv_sqft,
            a.area_sqft as api_sqft,
            c.floor_range as csv_floor,
            a.floor_range as api_floor
        FROM csv_sample c
        LEFT JOIN transactions a ON
            c.project_name = a.project_name
            AND c.price = a.price
            AND a.source = 'ura_api'
        LIMIT 5
    """)

    results = db.session.execute(query).fetchall()

    if not results:
        print("No sample data available")
        return

    for row in results:
        print(f"\nProject: {row[0]}")
        print(f"  contract_date: CSV={row[1]} | API={row[2]}")
        print(f"  price:         CSV={row[3]} | API={row[4]}")
        print(f"  area_sqft:     CSV={row[5]} | API={row[6]}")
        print(f"  floor_range:   CSV={row[7]} | API={row[8]}")

        # Flag mismatches
        if row[5] != row[6]:
            print(f"  ⚠️  area_sqft MISMATCH: {row[5]} vs {row[6]} (diff: {abs((row[5] or 0) - (row[6] or 0)):.2f})")
        if row[7] != row[8]:
            print(f"  ⚠️  floor_range MISMATCH: '{row[7]}' vs '{row[8]}'")


def main():
    """Run all diagnostic checks."""
    print("=" * 110)
    print("URA SYNC COVERAGE DIAGNOSTIC REPORT")
    print("=" * 110)

    app = create_app()
    with app.app_context():
        # First check total data
        query = text("""
            SELECT source, COUNT(*) as count
            FROM transactions
            GROUP BY source
            ORDER BY count DESC
        """)
        results = db.session.execute(query).fetchall()

        print("\nData summary:")
        for row in results:
            print(f"  {row[0] or 'unknown'}: {row[1]:,} rows")

        if not results:
            print("\n⚠️  No transaction data found. Is this the right database?")
            return

        # Run diagnostics
        half_returned = run_diagnostic_1()
        run_diagnostic_2(half_returned)
        run_diagnostic_3(half_returned)
        run_hash_sample_check()

        print("\n" + "=" * 110)
        print("DIAGNOSTIC COMPLETE")
        print("=" * 110)
        print("""
Next steps based on findings:
1. If API date range is narrower than CSV → URA API has a rolling window limit
2. If certain months show 0 API rows → API pagination or rate limit hit
3. If sale_type clusters differ → API filters out certain sale types
4. If floor_range mismatch → Normalization fix deployed but backfill needed
5. If area_sqft differs by ~0.01 → Rounding fix deployed but backfill needed

To re-run CSV hash backfill after normalization fix:
    python scripts/backfill_csv_row_hash.py --dry-run
    python scripts/backfill_csv_row_hash.py
""")


if __name__ == '__main__':
    main()
