#!/usr/bin/env python3
"""
================================================================================
DEPRECATED - Use check_data_health.py instead
================================================================================

This script is deprecated and will be removed in a future PR.

Replacement:
    python scripts/check_data_health.py              # Run all checks
    python scripts/check_data_health.py --district D10  # Focus on district
    python scripts/check_data_health.py --verbose    # Show all issues

The new system uses the project_units database table instead of CSV lookups.
See: backend/data_health/ for the new implementation.

================================================================================

audit_data_coverage.py - P0 Data Quality Audit (DEPRECATED)

This script identifies gaps between the transactions database and the CSV
unit data file. Missing unit data leads to inflated turnover rates and
inaccurate liquidity scores.

Usage:
    # Full audit
    python scripts/audit_data_coverage.py

    # Focus on specific district
    python scripts/audit_data_coverage.py --district D10

    # Export missing projects to CSV for filling
    python scripts/audit_data_coverage.py --export

    # Show impact on scores (with transaction counts)
    python scripts/audit_data_coverage.py --impact

Run from project root with DATABASE_URL set.
"""

import warnings
warnings.warn(
    "\n\n"
    "=" * 70 + "\n"
    "DEPRECATED: audit_data_coverage.py\n"
    "=" * 70 + "\n"
    "Use instead: python scripts/check_data_health.py\n"
    "This script will be removed in a future PR.\n"
    "=" * 70 + "\n",
    DeprecationWarning,
    stacklevel=2
)

import os
import sys
import csv
import argparse
from pathlib import Path
from collections import defaultdict

# Add backend to path
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

CSV_PATH = BACKEND_DIR / "data" / "new_launch_units.csv"
OUTPUT_PATH = SCRIPT_DIR / "missing_projects.csv"


def load_csv_projects() -> dict:
    """Load CSV into dict keyed by normalized project name."""
    projects = {}
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = row['project_name'].upper().strip()
            projects[key] = {
                'units': int(row['total_units']) if row.get('total_units') else None,
                'district': row.get('district') or None,
                'source': row.get('source') or None,
            }
    return projects


def get_db_projects(district_filter: str = None):
    """Get all projects with resale transactions from database."""
    from sqlalchemy import text
    from db.engine import get_engine

    engine = get_engine("job")

    district_clause = ""
    params = {}
    if district_filter:
        district_clause = "AND district = :district"
        params['district'] = district_filter

    with engine.connect() as conn:
        # Get all projects with resale transactions, grouped by district
        result = conn.execute(text(f"""
            SELECT
                district,
                UPPER(TRIM(project_name)) as project_name,
                COUNT(*) as tx_count,
                COUNT(DISTINCT EXTRACT(YEAR FROM transaction_date)) as years_active
            FROM transactions
            WHERE sale_type = 'Resale'
              AND COALESCE(is_outlier, false) = false
              AND project_name IS NOT NULL
              AND district IS NOT NULL
              {district_clause}
            GROUP BY district, UPPER(TRIM(project_name))
            ORDER BY district, COUNT(*) DESC
        """), params).fetchall()

        projects = []
        for row in result:
            projects.append({
                'district': row[0],
                'project_name': row[1],
                'tx_count': row[2],
                'years_active': row[3],
            })

        return projects


def run_audit(district_filter: str = None, show_impact: bool = False, export: bool = False):
    """Run full data coverage audit."""
    print("=" * 70)
    print("P0 DATA COVERAGE AUDIT")
    print("=" * 70)

    # Load CSV
    print("\n[1] Loading CSV data...")
    csv_projects = load_csv_projects()
    print(f"    CSV projects: {len(csv_projects):,}")

    # Load DB
    print("\n[2] Querying database for resale projects...")
    db_projects = get_db_projects(district_filter)
    print(f"    DB projects with resale: {len(db_projects):,}")

    # Find gaps
    print("\n[3] Analyzing coverage gaps...")

    by_district = defaultdict(lambda: {
        'total': 0,
        'with_units': 0,
        'missing': [],
        'total_tx': 0,
        'missing_tx': 0,
    })

    for proj in db_projects:
        dist = proj['district']
        name = proj['project_name']
        tx = proj['tx_count']

        by_district[dist]['total'] += 1
        by_district[dist]['total_tx'] += tx

        if name in csv_projects and csv_projects[name]['units']:
            by_district[dist]['with_units'] += 1
        else:
            by_district[dist]['missing'].append({
                'name': name,
                'tx_count': tx,
                'years_active': proj['years_active'],
            })
            by_district[dist]['missing_tx'] += tx

    # Summary
    print("\n" + "=" * 70)
    print("COVERAGE BY DISTRICT")
    print("=" * 70)
    print(f"\n{'District':<8} {'Total':>6} {'With Units':>10} {'Missing':>8} {'Coverage':>10} {'Missing Tx':>12}")
    print("-" * 70)

    total_missing = 0
    total_missing_tx = 0
    critical_districts = []

    for dist in sorted(by_district.keys()):
        d = by_district[dist]
        coverage = 100 * d['with_units'] / d['total'] if d['total'] > 0 else 0
        missing_count = len(d['missing'])
        total_missing += missing_count
        total_missing_tx += d['missing_tx']

        flag = "⚠️" if coverage < 70 else "  "
        print(f"{flag}{dist:<6} {d['total']:>6} {d['with_units']:>10} {missing_count:>8} {coverage:>9.1f}% {d['missing_tx']:>12,}")

        if coverage < 70:
            critical_districts.append((dist, coverage, missing_count, d['missing_tx']))

    print("-" * 70)
    print(f"TOTAL: {total_missing:,} projects missing unit data ({total_missing_tx:,} transactions affected)")

    # Critical districts
    if critical_districts:
        print("\n" + "=" * 70)
        print("⚠️  CRITICAL: LOW COVERAGE DISTRICTS (< 70%)")
        print("=" * 70)
        for dist, cov, missing, tx in critical_districts:
            print(f"\n{dist} - {cov:.1f}% coverage ({missing} projects, {tx:,} tx missing)")
            # Show top missing projects
            top_missing = sorted(by_district[dist]['missing'], key=lambda x: -x['tx_count'])[:5]
            for p in top_missing:
                print(f"    - {p['name']}: {p['tx_count']:,} tx")

    # Impact analysis
    if show_impact:
        print("\n" + "=" * 70)
        print("IMPACT ANALYSIS")
        print("=" * 70)
        print("""
Missing unit data causes:
1. INFLATED TURNOVER RATES - transactions divided by smaller housing stock
2. INACCURATE LIQUIDITY SCORES - percentile rankings are skewed
3. MISLEADING TIER CLASSIFICATIONS - districts may appear more/less liquid

Districts most affected (sorted by missing transactions):
""")
        sorted_impact = sorted(by_district.items(), key=lambda x: -x[1]['missing_tx'])[:10]
        for dist, d in sorted_impact:
            if d['missing_tx'] > 0:
                pct_tx_missing = 100 * d['missing_tx'] / d['total_tx']
                print(f"  {dist}: {d['missing_tx']:,} tx missing ({pct_tx_missing:.1f}% of district tx)")

    # Export
    if export:
        print("\n" + "=" * 70)
        print("EXPORTING MISSING PROJECTS")
        print("=" * 70)

        all_missing = []
        for dist, d in by_district.items():
            for proj in d['missing']:
                all_missing.append({
                    'district': dist,
                    'project_name': proj['name'],
                    'tx_count': proj['tx_count'],
                    'years_active': proj['years_active'],
                    'priority': 'HIGH' if proj['tx_count'] > 50 else 'MEDIUM' if proj['tx_count'] > 20 else 'LOW',
                })

        # Sort by priority and tx count
        all_missing.sort(key=lambda x: (-{'HIGH': 3, 'MEDIUM': 2, 'LOW': 1}[x['priority']], -x['tx_count']))

        with open(OUTPUT_PATH, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['district', 'project_name', 'tx_count', 'years_active', 'priority'])
            writer.writeheader()
            writer.writerows(all_missing)

        print(f"Exported {len(all_missing)} missing projects to: {OUTPUT_PATH}")
        print(f"\nHigh priority: {len([p for p in all_missing if p['priority'] == 'HIGH'])}")
        print(f"Medium priority: {len([p for p in all_missing if p['priority'] == 'MEDIUM'])}")
        print(f"Low priority: {len([p for p in all_missing if p['priority'] == 'LOW'])}")

    # Recommendations
    print("\n" + "=" * 70)
    print("RECOMMENDATIONS")
    print("=" * 70)
    print("""
1. RUN SCRAPER for high-priority missing projects:
   python scripts/scrape_total_units.py --hot --limit 100

2. VERIFY existing data:
   python scripts/verify_total_units.py --limit 50

3. MANUAL REVIEW for ultra-premium condos that scrapers miss:
   - ARDMORE PARK, THE NASSIM, GRAMERCY PARK, etc.
   - Check URA REALIS or developer websites

4. ADD COVERAGE WARNING in UI for districts < 70% coverage
   (Already implemented in hover card)
""")


def main():
    parser = argparse.ArgumentParser(description="P0 Data Coverage Audit")
    parser.add_argument("--district", help="Filter to specific district (e.g., D10)")
    parser.add_argument("--impact", action="store_true", help="Show impact analysis")
    parser.add_argument("--export", action="store_true", help="Export missing projects to CSV")
    args = parser.parse_args()

    run_audit(
        district_filter=args.district,
        show_impact=args.impact,
        export=args.export,
    )


if __name__ == "__main__":
    main()
