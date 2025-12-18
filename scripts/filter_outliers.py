"""
Standalone Outlier Filtering Script

This script filters outliers from existing database data using IQR method.
Run this to clean existing data without needing to re-upload CSVs.

Uses centralized data_validation module for all filtering operations.

Usage:
    python scripts/filter_outliers.py

Pipeline: Load Raw → **Validate/Filter** → Store in DB → Compute Stats
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from config import Config
from models.database import db
from models.transaction import Transaction
from services.data_validation import (
    calculate_iqr_bounds,
    count_outliers,
    get_sample_outliers,
    filter_outliers_sql,
    print_iqr_statistics
)
from services.data_computation import recompute_all_stats


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def main():
    """Main function"""
    print("=" * 60)
    print("Standalone Outlier Filtering Script")
    print("=" * 60)
    print("\nThis script will filter outliers from existing database data")
    print("using the IQR (Interquartile Range) method.")
    print("\nOutliers are defined as values outside:")
    print("  [Q1 - 1.5*IQR, Q3 + 1.5*IQR]")

    app = create_app()

    with app.app_context():
        # Check current transaction count
        before_count = db.session.query(Transaction).count()
        print(f"\nCurrent transaction count: {before_count:,}")

        if before_count == 0:
            print("\n❌ No transactions found in database.")
            print("   Please run: python scripts/upload.py first")
            return

        # Calculate IQR bounds
        print("\n" + "=" * 60)
        print("Calculating IQR statistics...")
        print("=" * 60)

        lower_bound, upper_bound, stats = calculate_iqr_bounds()

        if lower_bound is None or upper_bound is None:
            print("Could not calculate quartiles, skipping outlier filtering")
            return

        # Print statistics
        print_iqr_statistics(stats)

        # Count outliers
        outlier_count = count_outliers(lower_bound, upper_bound)
        print(f"\n🎯 Outliers detected: {outlier_count:,}")

        if outlier_count == 0:
            print("No outliers to remove!")
            print("\n" + "=" * 60)
            print("Database unchanged. No outliers found.")
            print("=" * 60)
            return

        # Show sample outliers
        print("\n📋 Sample outliers (top 10 by price):")
        samples = get_sample_outliers(lower_bound, upper_bound, limit=10)
        for sample in samples:
            print(f"   ${sample['price']:,.0f} - {sample['project_name']} ({sample['district']})")

        # Confirm deletion
        confirm = input(f"\n⚠️  Delete {outlier_count:,} outliers? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Aborted. No changes made.")
            return

        # Filter outliers using centralized function
        print("\n🔍 Filtering outliers...")
        outliers_excluded, _ = filter_outliers_sql(dry_run=False)

        print(f"\n✅ Removed {outliers_excluded:,} outliers")

        # Verify final count
        after_count = db.session.query(Transaction).count()
        print(f"   Final clean records: {after_count:,}")

        # Trigger recomputation
        print("\n" + "=" * 60)
        print("Recomputing aggregated statistics...")
        print("=" * 60)

        recompute_all_stats(outliers_excluded=outliers_excluded)

        print("\n" + "=" * 60)
        print("✅ All done! Outliers filtered and stats recomputed.")
        print(f"   {outliers_excluded:,} outlier records removed")
        print("=" * 60)


if __name__ == "__main__":
    main()
