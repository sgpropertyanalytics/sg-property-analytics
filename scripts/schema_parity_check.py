#!/usr/bin/env python3
"""
Schema Parity Check - Verify CSV columns match database schema

Usage:
    python -m scripts.schema_parity_check
    python -m scripts.schema_parity_check --csv-path /path/to/sample.csv
    python -m scripts.schema_parity_check --verbose

This script:
1. Reads sample CSV files from rawdata/ folder
2. Compares CSV columns to Transaction model columns
3. Reports any missing mappings or discrepancies
4. Verifies the import pipeline preserves all columns
"""

import sys
import os
import argparse

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pandas as pd
from typing import List, Dict, Set, Tuple


# === Expected CSV columns from URA REALIS format ===
EXPECTED_CSV_COLUMNS = {
    'Project Name',
    'Street Name',
    'Property Type',
    'Postal District',
    'Market Segment',
    'Tenure',
    'Type of Sale',
    'No. of Units',
    'Nett Price ($)',
    'Transacted Price ($)',
    'Area (SQFT)',
    'Type of Area',
    'Unit Price ($ PSF)',
    'Sale Date',
    'Floor Range',
}

# === CSV to DB column mapping ===
CSV_TO_DB_MAPPING = {
    'Project Name': 'project_name',
    'Street Name': 'street_name',
    'Property Type': 'property_type',
    'Postal District': 'district',  # Transformed to D01, D02, etc.
    'Market Segment': 'market_segment',
    'Tenure': 'tenure',
    'Type of Sale': 'sale_type',
    'No. of Units': 'num_units',
    'Nett Price ($)': 'nett_price',
    'Transacted Price ($)': 'price',
    'Area (SQFT)': 'area_sqft',
    'Type of Area': 'type_of_area',
    'Unit Price ($ PSF)': 'psf',
    'Sale Date': 'transaction_date',  # Transformed to YYYY-MM-DD
    'Floor Range': 'floor_range',
}

# === Computed columns (not from CSV) ===
COMPUTED_COLUMNS = {
    'id',  # Primary key
    'contract_date',  # Derived from transaction_date
    'bedroom_count',  # Classified from area_sqft
    'floor_level',  # Classified from floor_range
    'lease_start_year',  # Parsed from tenure
    'remaining_lease',  # Calculated from tenure
    'created_at',  # Timestamp
}


def get_db_columns() -> Set[str]:
    """Get all column names from the Transaction model."""
    from models.transaction import Transaction
    from sqlalchemy import inspect

    mapper = inspect(Transaction)
    return {column.key for column in mapper.columns}


def get_csv_columns(csv_path: str) -> Set[str]:
    """Get column names from a CSV file."""
    try:
        # Read just the header row
        df = pd.read_csv(csv_path, nrows=0)
        return set(df.columns)
    except Exception as e:
        print(f"Error reading {csv_path}: {e}")
        return set()


def find_sample_csv() -> str:
    """Find a sample CSV file from rawdata folder."""
    rawdata_path = os.path.join(os.path.dirname(__file__), '..', 'rawdata')

    if not os.path.exists(rawdata_path):
        return None

    # Check New Sale folder first
    new_sale_path = os.path.join(rawdata_path, 'New Sale')
    if os.path.exists(new_sale_path):
        for f in os.listdir(new_sale_path):
            if f.endswith('.csv'):
                return os.path.join(new_sale_path, f)

    # Check Resale folder
    resale_path = os.path.join(rawdata_path, 'Resale')
    if os.path.exists(resale_path):
        for f in os.listdir(resale_path):
            if f.endswith('.csv'):
                return os.path.join(resale_path, f)

    return None


def check_csv_to_db_mapping(csv_columns: Set[str], db_columns: Set[str], verbose: bool = False) -> Tuple[bool, List[str]]:
    """
    Check if all CSV columns have corresponding DB columns.

    Returns:
        Tuple of (all_mapped, list_of_issues)
    """
    issues = []

    # Check each CSV column has a mapping
    for csv_col in csv_columns:
        if csv_col in CSV_TO_DB_MAPPING:
            db_col = CSV_TO_DB_MAPPING[csv_col]
            if db_col not in db_columns:
                issues.append(f"CSV '{csv_col}' maps to DB '{db_col}' but column doesn't exist in model")
        else:
            if verbose:
                print(f"  ⚠️  CSV column '{csv_col}' has no explicit mapping (may be preserved as-is)")

    # Check for expected CSV columns that are missing
    missing_expected = EXPECTED_CSV_COLUMNS - csv_columns
    if missing_expected:
        for col in missing_expected:
            issues.append(f"Expected CSV column '{col}' not found in file")

    return len(issues) == 0, issues


def check_db_completeness(db_columns: Set[str], verbose: bool = False) -> Tuple[bool, List[str]]:
    """
    Check if all expected DB columns exist.

    Returns:
        Tuple of (all_present, list_of_issues)
    """
    issues = []

    # All columns that should be in DB
    expected_db_columns = set(CSV_TO_DB_MAPPING.values()) | COMPUTED_COLUMNS

    missing = expected_db_columns - db_columns
    if missing:
        for col in missing:
            issues.append(f"Expected DB column '{col}' not found in Transaction model")

    if verbose:
        extra = db_columns - expected_db_columns
        if extra:
            print(f"  ℹ️  Extra DB columns (not in mapping): {extra}")

    return len(issues) == 0, issues


def main():
    parser = argparse.ArgumentParser(
        description='Check CSV to database schema parity'
    )
    parser.add_argument(
        '--csv-path',
        help='Path to a sample CSV file to check'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Show detailed output'
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Schema Parity Check")
    print("=" * 60)

    # Get DB columns
    print("\n📊 Checking Transaction model columns...")
    try:
        db_columns = get_db_columns()
        print(f"   Found {len(db_columns)} columns in Transaction model")
        if args.verbose:
            print(f"   Columns: {sorted(db_columns)}")
    except Exception as e:
        print(f"   ❌ Error loading Transaction model: {e}")
        return 1

    # Get CSV columns
    csv_path = args.csv_path or find_sample_csv()
    if csv_path:
        print(f"\n📄 Checking CSV file: {os.path.basename(csv_path)}")
        csv_columns = get_csv_columns(csv_path)
        print(f"   Found {len(csv_columns)} columns in CSV")
        if args.verbose:
            print(f"   Columns: {sorted(csv_columns)}")
    else:
        print("\n⚠️  No CSV file found. Using expected column list.")
        csv_columns = EXPECTED_CSV_COLUMNS

    # Check mappings
    print("\n🔍 Checking CSV → DB mapping...")
    mapping_ok, mapping_issues = check_csv_to_db_mapping(csv_columns, db_columns, args.verbose)
    if mapping_ok:
        print("   ✅ All CSV columns have valid DB mappings")
    else:
        print("   ❌ Mapping issues found:")
        for issue in mapping_issues:
            print(f"      - {issue}")

    # Check DB completeness
    print("\n🔍 Checking DB schema completeness...")
    db_ok, db_issues = check_db_completeness(db_columns, args.verbose)
    if db_ok:
        print("   ✅ All expected columns exist in Transaction model")
    else:
        print("   ❌ DB schema issues found:")
        for issue in db_issues:
            print(f"      - {issue}")

    # Print summary
    print("\n" + "=" * 60)
    if mapping_ok and db_ok:
        print("✅ Schema parity check PASSED")
        print("   All CSV columns are properly mapped to database columns.")
        return 0
    else:
        print("❌ Schema parity check FAILED")
        print("   Some columns may be dropped during import.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
