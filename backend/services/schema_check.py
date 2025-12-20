"""
Schema Check Service - Validates database schema matches SQLAlchemy models

This service compares the actual database schema against the expected
SQLAlchemy model definitions and reports any discrepancies.

Usage:
    # At startup (in app.py)
    from services.schema_check import run_schema_check
    report = run_schema_check()
    if not report['is_valid']:
        print("Schema drift detected!")
        for issue in report['missing_columns']:
            print(f"  Missing: {issue['table']}.{issue['column']}")

    # CLI
    python -m services.schema_check
"""

from typing import Dict, List, Any, Set
from sqlalchemy import text, inspect
from models.database import db


# Expected columns per table (from SQLAlchemy models)
# This is the source of truth for what columns SHOULD exist
EXPECTED_SCHEMA = {
    'transactions': {
        'required': [
            'id', 'project_name', 'transaction_date', 'price', 'area_sqft',
            'psf', 'district', 'bedroom_count', 'created_at'
        ],
        'optional': [
            'contract_date', 'property_type', 'sale_type', 'tenure',
            'lease_start_year', 'remaining_lease',
            # New columns for CSV parity
            'street_name', 'floor_range', 'floor_level', 'num_units',
            'nett_price', 'type_of_area', 'market_segment'
        ]
    },
    'new_launches': {
        'required': ['id', 'project_name', 'created_at'],
        'optional': [
            'developer', 'district', 'planning_area', 'market_segment',
            'address', 'total_units', 'units_1br', 'units_2br', 'units_3br',
            'units_4br', 'units_5br_plus', 'indicative_psf_low',
            'indicative_psf_high', 'tenure', 'property_type', 'launch_year',
            'expected_launch_date', 'expected_top_date', 'site_area_sqft',
            'gls_tender_id', 'land_bid_psf', 'data_source', 'data_confidence',
            'needs_review', 'review_reason', 'updated_at'
        ]
    },
    'gls_tenders': {
        'required': ['id', 'status', 'release_id', 'release_url', 'location_raw', 'created_at'],
        'optional': [
            'release_date', 'tender_close_date', 'latitude', 'longitude',
            'planning_area', 'market_segment', 'site_area_sqm', 'site_area_sqft',
            'max_gfa_sqm', 'max_gfa_sqft', 'plot_ratio', 'estimated_units',
            'estimated_units_source', 'successful_tenderer', 'tendered_price_sgd',
            'num_tenderers', 'psf_ppr', 'psm_gfa', 'psf_land', 'psm_land',
            'implied_launch_psf_low', 'implied_launch_psf_high',
            'secondary_source_url', 'price_validated', 'needs_review', 'review_reason'
        ]
    },
    'project_locations': {
        'required': ['id', 'project_name', 'created_at'],
        'optional': [
            'district', 'market_segment', 'planning_area', 'latitude', 'longitude',
            'has_popular_school_1km', 'geocode_status', 'geocode_source',
            'geocode_error', 'address', 'postal_code', 'transaction_count',
            'first_transaction_date', 'last_transaction_date', 'updated_at',
            'last_geocoded_at'
        ]
    },
    'popular_schools': {
        'required': ['id', 'school_name', 'created_at'],
        'optional': [
            'latitude', 'longitude', 'address', 'postal_code',
            'school_type', 'planning_area'
        ]
    },
    'precomputed_stats': {
        'required': ['id', 'stat_key', 'created_at'],
        'optional': ['stat_value', 'updated_at']
    }
}


def get_database_columns(table_name: str) -> Set[str]:
    """Get actual columns from database for a table."""
    try:
        result = db.session.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :table_name
        """), {'table_name': table_name})
        return {row[0] for row in result.fetchall()}
    except Exception:
        return set()


def get_database_tables() -> Set[str]:
    """Get list of tables in database."""
    try:
        result = db.session.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """))
        return {row[0] for row in result.fetchall()}
    except Exception:
        return set()


def run_schema_check() -> Dict[str, Any]:
    """
    Run schema check comparing database to expected model schema.

    Returns:
        Dict with:
            - is_valid: bool - True if no critical issues
            - missing_tables: List of tables that don't exist
            - missing_columns: List of {table, column, severity} for missing columns
            - extra_columns: List of {table, column} for columns in DB but not in model
            - summary: Human-readable summary string
    """
    missing_tables = []
    missing_columns = []
    extra_columns = []

    db_tables = get_database_tables()

    for table_name, schema in EXPECTED_SCHEMA.items():
        # Check if table exists
        if table_name not in db_tables:
            missing_tables.append(table_name)
            continue

        # Get actual columns
        db_columns = get_database_columns(table_name)
        expected_required = set(schema['required'])
        expected_optional = set(schema['optional'])
        expected_all = expected_required | expected_optional

        # Check for missing required columns (critical)
        for col in expected_required:
            if col not in db_columns:
                missing_columns.append({
                    'table': table_name,
                    'column': col,
                    'severity': 'critical'
                })

        # Check for missing optional columns (warning)
        for col in expected_optional:
            if col not in db_columns:
                missing_columns.append({
                    'table': table_name,
                    'column': col,
                    'severity': 'warning'
                })

        # Check for extra columns (info only)
        for col in db_columns:
            if col not in expected_all:
                extra_columns.append({
                    'table': table_name,
                    'column': col
                })

    # Determine if schema is valid (no critical issues)
    critical_issues = [c for c in missing_columns if c['severity'] == 'critical']
    is_valid = len(missing_tables) == 0 and len(critical_issues) == 0

    # Build summary
    summary_parts = []
    if missing_tables:
        summary_parts.append(f"Missing tables: {', '.join(missing_tables)}")
    if critical_issues:
        cols = [f"{c['table']}.{c['column']}" for c in critical_issues]
        summary_parts.append(f"Missing critical columns: {', '.join(cols)}")

    warning_issues = [c for c in missing_columns if c['severity'] == 'warning']
    if warning_issues:
        summary_parts.append(f"{len(warning_issues)} optional columns missing")

    summary = '; '.join(summary_parts) if summary_parts else 'Schema OK'

    return {
        'is_valid': is_valid,
        'missing_tables': missing_tables,
        'missing_columns': missing_columns,
        'extra_columns': extra_columns,
        'summary': summary
    }


def print_schema_report(report: Dict[str, Any]) -> None:
    """Print a human-readable schema report."""
    print("\n" + "=" * 60)
    print("SCHEMA CHECK REPORT")
    print("=" * 60)

    if report['is_valid']:
        print("Status: OK")
    else:
        print("Status: SCHEMA DRIFT DETECTED")

    if report['missing_tables']:
        print(f"\nMissing Tables ({len(report['missing_tables'])}):")
        for table in report['missing_tables']:
            print(f"   {table}")

    critical = [c for c in report['missing_columns'] if c['severity'] == 'critical']
    if critical:
        print(f"\nMissing Critical Columns ({len(critical)}):")
        for col in critical:
            print(f"   {col['table']}.{col['column']}")

    warnings = [c for c in report['missing_columns'] if c['severity'] == 'warning']
    if warnings:
        print(f"\nMissing Optional Columns ({len(warnings)}):")
        for col in warnings:
            print(f"   {col['table']}.{col['column']}")

    if report['extra_columns']:
        print(f"\nExtra Columns in DB ({len(report['extra_columns'])}):")
        for col in report['extra_columns']:
            print(f"   {col['table']}.{col['column']}")

    print("\n" + "=" * 60)

    if not report['is_valid']:
        print("\nTo fix schema issues, run:")
        print("   psql \"$DATABASE_URL\" -f backend/migrations/001_add_all_missing_columns.sql")
        print("=" * 60)


def check_and_report() -> bool:
    """
    Run schema check and print report.
    Returns True if schema is valid, False otherwise.
    """
    report = run_schema_check()
    print_schema_report(report)
    return report['is_valid']


# CLI entry point
if __name__ == '__main__':
    import sys
    import os

    # Add backend to path
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

    from app import create_app

    app = create_app()
    with app.app_context():
        is_valid = check_and_report()
        sys.exit(0 if is_valid else 1)
