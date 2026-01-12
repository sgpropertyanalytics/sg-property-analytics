#!/usr/bin/env python3
"""
check_data_health.py - Run data health checks on project_units registry

This is the main entry point for data quality verification. It runs three
checks (Phase 1 - no external API calls):

1. COMPLETENESS: All projects in transactions exist in registry
2. PLAUSIBILITY: New sale count <= total_units
3. COVERAGE: Percentage of projects with known units per district

Usage:
    # Run all checks
    python scripts/check_data_health.py

    # Run specific check only
    python scripts/check_data_health.py --check completeness
    python scripts/check_data_health.py --check plausibility
    python scripts/check_data_health.py --check coverage

    # Focus on specific district
    python scripts/check_data_health.py --district D10

    # Show all issues (verbose)
    python scripts/check_data_health.py --verbose

    # Output as JSON
    python scripts/check_data_health.py --json

    # Exit with error code if checks fail (for CI)
    python scripts/check_data_health.py --strict

Prerequisites:
    1. Run SQL migration: backend/migrations/020_create_project_units.sql
    2. Run data migration: python scripts/migrate_project_units.py
    3. Set DATABASE_URL environment variable
"""

import os
import sys
import json
import argparse
import logging
from pathlib import Path
from datetime import datetime

# Add backend to path
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',
)
logger = logging.getLogger('check_data_health')


def create_app_context():
    """Create Flask app context for database access."""
    from app import create_app
    app = create_app()
    return app.app_context()


def run_checks(
    check_name: str = None,
    district: str = None,
    verbose: bool = False,
    output_json: bool = False,
) -> dict:
    """
    Run data health checks.

    Args:
        check_name: Specific check to run (completeness, plausibility, coverage)
        district: Filter to specific district
        verbose: Show all issues
        output_json: Output as JSON instead of human-readable

    Returns:
        Dict with check results
    """
    from data_health.checks import (
        run_all_checks,
        check_completeness,
        check_plausibility,
        check_coverage,
        print_report,
        HealthReport,
    )

    if check_name:
        # Run specific check
        report = HealthReport()
        if check_name == 'completeness':
            report.completeness = check_completeness()
        elif check_name == 'plausibility':
            report.plausibility = check_plausibility()
        elif check_name == 'coverage':
            report.coverage = check_coverage()
        else:
            logger.error(f"Unknown check: {check_name}")
            logger.error("Valid checks: completeness, plausibility, coverage")
            sys.exit(1)
    else:
        # Run all checks
        report = run_all_checks()

    # Filter by district if specified
    if district:
        report = filter_report_by_district(report, district)

    # Output
    if output_json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print_report(report, verbose=verbose)

    return report


def filter_report_by_district(report, district: str):
    """Filter report issues to specific district."""
    from data_health.checks import HealthReport

    filtered = HealthReport()

    if report.completeness:
        filtered.completeness = report.completeness
        filtered.completeness.issues = [
            i for i in report.completeness.issues
            if i.district == district or i.district is None
        ]

    if report.plausibility:
        filtered.plausibility = report.plausibility
        filtered.plausibility.issues = [
            i for i in report.plausibility.issues
            if i.district == district or i.district is None
        ]

    if report.coverage:
        filtered.coverage = report.coverage
        filtered.coverage.issues = [
            i for i in report.coverage.issues
            if i.district == district
        ]

    return filtered


def print_quick_summary():
    """Print a quick summary without running full checks."""
    from models import ProjectUnits
    from models.project_units import UNITS_STATUS_VERIFIED, UNITS_STATUS_UNKNOWN, UNITS_STATUS_CONFLICT
    from sqlalchemy import func

    print("=" * 60)
    print("PROJECT UNITS REGISTRY - QUICK SUMMARY")
    print("=" * 60)

    total = ProjectUnits.query.count()
    if total == 0:
        print("\n⚠️  Registry is empty!")
        print("   Run: python scripts/migrate_project_units.py")
        return

    verified = ProjectUnits.query.filter_by(units_status=UNITS_STATUS_VERIFIED).count()
    unknown = ProjectUnits.query.filter_by(units_status=UNITS_STATUS_UNKNOWN).count()
    conflict = ProjectUnits.query.filter_by(units_status=UNITS_STATUS_CONFLICT).count()
    needs_review = ProjectUnits.query.filter_by(needs_review=True).count()

    print(f"\nTotal projects: {total:,}")
    print(f"  ✓ Verified:     {verified:,} ({100*verified/total:.1f}%)")
    print(f"  ? Unknown:      {unknown:,} ({100*unknown/total:.1f}%)")
    print(f"  ✗ Conflict:     {conflict:,}")
    print(f"  ⚠ Needs review: {needs_review:,}")

    # Coverage by district (top 5 lowest)
    print("\nLowest coverage districts:")

    from models import db
    coverage_query = db.session.query(
        ProjectUnits.district,
        func.count(ProjectUnits.id).label('total'),
        func.sum(
            db.case((ProjectUnits.units_status == UNITS_STATUS_VERIFIED, 1), else_=0)
        ).label('verified')
    ).filter(
        ProjectUnits.district.isnot(None)
    ).group_by(ProjectUnits.district).all()

    coverage_data = []
    for row in coverage_query:
        if row.total > 0:
            pct = 100 * (row.verified or 0) / row.total
            coverage_data.append((row.district, row.total, row.verified or 0, pct))

    coverage_data.sort(key=lambda x: x[3])

    print(f"  {'District':<10} {'Total':>8} {'Verified':>10} {'Coverage':>10}")
    print(f"  {'-' * 40}")
    for district, total, verified, pct in coverage_data[:5]:
        flag = "⚠️" if pct < 70 else "  "
        print(f"  {flag}{district:<8} {total:>8} {verified:>10} {pct:>9.1f}%")

    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Run data health checks on project_units registry",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          Run all checks
  %(prog)s --check completeness     Run completeness check only
  %(prog)s --district D10           Focus on district D10
  %(prog)s --verbose                Show all issues
  %(prog)s --json                   Output as JSON
  %(prog)s --strict                 Exit with error if checks fail
  %(prog)s --summary                Quick summary (no checks)
        """
    )
    parser.add_argument(
        "--check",
        choices=["completeness", "plausibility", "coverage"],
        help="Run specific check only"
    )
    parser.add_argument(
        "--district",
        help="Filter to specific district (e.g., D10)"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Show all issues (default shows top issues only)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON"
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with code 1 if any check fails (for CI)"
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Quick summary without running full checks"
    )
    args = parser.parse_args()

    with create_app_context():
        if args.summary:
            print_quick_summary()
            return

        if not args.json:
            print("=" * 80)
            print("DATA HEALTH CHECK")
            print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("=" * 80)

        report = run_checks(
            check_name=args.check,
            district=args.district,
            verbose=args.verbose,
            output_json=args.json,
        )

        # Exit code for CI
        if args.strict and not report.all_passed:
            sys.exit(1)


if __name__ == "__main__":
    main()
