#!/usr/bin/env python3
"""
Reimport CSV - Re-upload all CSV data with full column preservation

Usage:
    python -m scripts.reimport_csv
    python -m scripts.reimport_csv --dry-run
    python -m scripts.reimport_csv --skip-validation
    python -m scripts.reimport_csv --force

This script:
1. Backs up current transaction count
2. Clears existing transactions
3. Re-imports all CSV files with ALL columns preserved
4. Runs validation (duplicates, outliers)
5. Recomputes statistics

Use this after updating the schema to include new columns.
"""

import sys
import os
import gc
import argparse
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from config import Config
from models.database import db
from models.transaction import Transaction
from services.data_loader import clean_csv_data, parse_date_flexible
from services.data_computation import recompute_all_stats
from services.data_validation import (
    filter_outliers_sql,
    remove_duplicates_sql,
    print_iqr_statistics
)
import pandas as pd


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def count_csv_files(rawdata_path: str) -> dict:
    """Count CSV files in rawdata folder."""
    counts = {'new_sale': 0, 'resale': 0, 'total': 0}

    new_sale_path = os.path.join(rawdata_path, 'New Sale')
    if os.path.exists(new_sale_path):
        counts['new_sale'] = len([f for f in os.listdir(new_sale_path) if f.endswith('.csv')])

    resale_path = os.path.join(rawdata_path, 'Resale')
    if os.path.exists(resale_path):
        counts['resale'] = len([f for f in os.listdir(resale_path) if f.endswith('.csv')])

    counts['total'] = counts['new_sale'] + counts['resale']
    return counts


def preview_csv_columns(rawdata_path: str) -> set:
    """Preview columns from sample CSV files."""
    all_columns = set()

    for folder in ['New Sale', 'Resale']:
        folder_path = os.path.join(rawdata_path, folder)
        if os.path.exists(folder_path):
            for f in os.listdir(folder_path):
                if f.endswith('.csv'):
                    try:
                        df = pd.read_csv(os.path.join(folder_path, f), nrows=0)
                        all_columns.update(df.columns)
                    except:
                        pass
                    break  # Just need one file per folder

    return all_columns


def main():
    parser = argparse.ArgumentParser(
        description='Re-import all CSV data with full column preservation'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview what would be done without making changes'
    )
    parser.add_argument(
        '--skip-validation',
        action='store_true',
        help='Skip duplicate removal and outlier filtering'
    )
    parser.add_argument(
        '--force', '-f',
        action='store_true',
        help='Skip confirmation prompt'
    )
    args = parser.parse_args()

    print("=" * 60)
    print("CSV Reimport Script - Full Column Preservation")
    print("=" * 60)

    # Check rawdata folder
    rawdata_path = os.path.join(os.path.dirname(__file__), '..', 'rawdata')
    if not os.path.exists(rawdata_path):
        print(f"\n❌ Error: rawdata folder not found: {rawdata_path}")
        return 1

    # Count CSV files
    csv_counts = count_csv_files(rawdata_path)
    print(f"\n📂 CSV files found:")
    print(f"   New Sale: {csv_counts['new_sale']} files")
    print(f"   Resale: {csv_counts['resale']} files")
    print(f"   Total: {csv_counts['total']} files")

    if csv_counts['total'] == 0:
        print("\n❌ No CSV files found to import.")
        return 1

    # Preview columns
    csv_columns = preview_csv_columns(rawdata_path)
    print(f"\n📋 CSV columns detected ({len(csv_columns)}):")
    for col in sorted(csv_columns):
        print(f"   - {col}")

    # Create app and check current state
    app = create_app()

    with app.app_context():
        current_count = db.session.query(Transaction).count()
        print(f"\n📊 Current database state:")
        print(f"   Transactions: {current_count:,}")

        # Check for new columns
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        db_columns = [col['name'] for col in inspector.get_columns('transactions')]
        new_columns = ['street_name', 'floor_range', 'floor_level', 'num_units',
                       'nett_price', 'type_of_area', 'market_segment']
        missing_columns = [col for col in new_columns if col not in db_columns]

        if missing_columns:
            print(f"\n⚠️  Missing DB columns (need migration): {missing_columns}")
            print("   Run: flask db upgrade (or db.create_all() for SQLite)")

    if args.dry_run:
        print("\n" + "=" * 60)
        print("DRY RUN - No changes made")
        print("=" * 60)
        print("\nThis would:")
        print(f"  1. Clear {current_count:,} existing transactions")
        print(f"  2. Import {csv_counts['total']} CSV files")
        print(f"  3. Preserve {len(csv_columns)} columns from CSV")
        if not args.skip_validation:
            print("  4. Remove duplicates")
            print("  5. Filter outliers")
            print("  6. Recompute statistics")
        return 0

    # Confirm
    if not args.force:
        print(f"\n⚠️  This will CLEAR all {current_count:,} existing transactions!")
        response = input("Continue? (yes/no): ")
        if response.lower() != 'yes':
            print("Aborted.")
            return 0

    # Import using the main upload script
    print("\n" + "=" * 60)
    print("Starting reimport...")
    print("=" * 60)

    # Import the upload module's main logic
    from scripts.upload import process_and_save_csv

    with app.app_context():
        # Clear existing data
        print("\n🗑️  Clearing existing transactions...")
        db.session.query(Transaction).delete()
        db.session.commit()
        print("   ✓ Cleared")

        # Ensure tables have new columns
        print("\n🔧 Ensuring schema is up to date...")
        db.create_all()
        print("   ✓ Schema updated")

    # Process CSV files
    total_saved = 0

    # Process New Sale
    new_sale_folder = os.path.join(rawdata_path, 'New Sale')
    if os.path.exists(new_sale_folder):
        print("\n📊 Processing New Sale data...")
        for filename in sorted(os.listdir(new_sale_folder)):
            if filename.endswith('.csv'):
                csv_path = os.path.join(new_sale_folder, filename)
                saved = process_and_save_csv(csv_path, 'New Sale', app)
                total_saved += saved
                gc.collect()

    # Process Resale
    resale_folder = os.path.join(rawdata_path, 'Resale')
    if os.path.exists(resale_folder):
        print("\n📊 Processing Resale data...")
        for filename in sorted(os.listdir(resale_folder)):
            if filename.endswith('.csv'):
                csv_path = os.path.join(resale_folder, filename)
                saved = process_and_save_csv(csv_path, 'Resale', app)
                total_saved += saved
                gc.collect()

    print(f"\n📊 Total rows imported: {total_saved:,}")

    # Validation
    if not args.skip_validation:
        with app.app_context():
            print("\n🔍 Removing duplicates...")
            duplicates_removed = remove_duplicates_sql()
            print(f"   ✓ Removed {duplicates_removed:,} duplicates")

            print("\n🔍 Filtering outliers...")
            outliers_excluded, stats = filter_outliers_sql()
            print_iqr_statistics(stats)
            print(f"   ✓ Removed {outliers_excluded:,} outliers")

            # Recompute stats
            print("\n📈 Recomputing statistics...")
            recompute_all_stats(outliers_excluded=outliers_excluded)

            final_count = db.session.query(Transaction).count()
            print(f"\n✅ Reimport complete!")
            print(f"   Final transaction count: {final_count:,}")

            # Verify new columns have data
            print("\n🔍 Verifying new column data:")
            for col in new_columns:
                if col in db_columns or col not in missing_columns:
                    try:
                        sql = f"SELECT COUNT(*) FROM transactions WHERE {col} IS NOT NULL AND {col} != ''"
                        from sqlalchemy import text
                        count = db.session.execute(text(sql)).scalar()
                        print(f"   {col}: {count:,} non-null values")
                    except:
                        print(f"   {col}: (column not yet in DB)")
    else:
        print("\n⚠️  Skipped validation and statistics computation")

    print("\n" + "=" * 60)
    print("✅ Reimport complete!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
