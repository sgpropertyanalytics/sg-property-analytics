"""
Standalone Outlier Filtering Script

This script filters outliers from existing database data using IQR method.
Run this to clean existing data without needing to re-upload CSVs.

Usage:
    python scripts/filter_outliers.py
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from sqlalchemy import text
from config import Config
from models.database import db
from models.transaction import Transaction
from services.aggregation_service import recompute_all_stats


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def filter_outliers_sql(app):
    """
    Filter outliers using SQL-based IQR calculation.
    No pandas needed - fully SQL-based for memory efficiency.

    Returns count of outliers removed.
    """
    print("\n" + "=" * 60)
    print("Filtering outliers using IQR method (SQL-based)...")
    print("=" * 60)

    with app.app_context():
        before_count = db.session.query(Transaction).count()
        print(f"\nCurrent transaction count: {before_count:,}")

        # Calculate Q1, Q3 using SQL percentile functions
        # PostgreSQL uses percentile_cont, SQLite needs different approach
        try:
            # Try PostgreSQL syntax first
            quartile_sql = text("""
                SELECT
                    percentile_cont(0.25) WITHIN GROUP (ORDER BY price) as q1,
                    percentile_cont(0.75) WITHIN GROUP (ORDER BY price) as q3
                FROM transactions
                WHERE price > 0
            """)
            result = db.session.execute(quartile_sql).fetchone()
            q1, q3 = result[0], result[1]
            print("Using PostgreSQL percentile_cont for IQR calculation")
        except Exception as e:
            print(f"PostgreSQL percentile_cont failed: {e}")
            print("Falling back to SQLite-compatible approach...")

            # Fallback for SQLite - use subquery approach
            count_sql = text("SELECT COUNT(*) FROM transactions WHERE price > 0")
            count = db.session.execute(count_sql).scalar()

            q1_offset = int(count * 0.25)
            q3_offset = int(count * 0.75)

            q1_sql = text(f"SELECT price FROM transactions WHERE price > 0 ORDER BY price LIMIT 1 OFFSET {q1_offset}")
            q3_sql = text(f"SELECT price FROM transactions WHERE price > 0 ORDER BY price LIMIT 1 OFFSET {q3_offset}")

            q1 = db.session.execute(q1_sql).scalar()
            q3 = db.session.execute(q3_sql).scalar()

        if q1 is None or q3 is None:
            print("Could not calculate quartiles, skipping outlier filtering")
            return 0

        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        print(f"\n📊 IQR Statistics:")
        print(f"   Q1 (25th percentile): ${q1:,.0f}")
        print(f"   Q3 (75th percentile): ${q3:,.0f}")
        print(f"   IQR: ${iqr:,.0f}")
        print(f"   Lower bound (Q1 - 1.5*IQR): ${lower_bound:,.0f}")
        print(f"   Upper bound (Q3 + 1.5*IQR): ${upper_bound:,.0f}")

        # Count outliers first
        count_outliers_sql = text("""
            SELECT COUNT(*) FROM transactions
            WHERE price < :lower_bound OR price > :upper_bound
        """)
        outlier_count = db.session.execute(
            count_outliers_sql,
            {'lower_bound': lower_bound, 'upper_bound': upper_bound}
        ).scalar()

        print(f"\n🎯 Outliers detected: {outlier_count:,}")

        if outlier_count == 0:
            print("No outliers to remove!")
            return 0

        # Show some examples of outliers
        print("\n📋 Sample outliers (top 10 by price):")
        sample_sql = text("""
            SELECT project_name, price, district
            FROM transactions
            WHERE price < :lower_bound OR price > :upper_bound
            ORDER BY price DESC
            LIMIT 10
        """)
        samples = db.session.execute(
            sample_sql,
            {'lower_bound': lower_bound, 'upper_bound': upper_bound}
        ).fetchall()

        for sample in samples:
            print(f"   ${sample[1]:,.0f} - {sample[0]} ({sample[2]})")

        # Confirm deletion
        confirm = input(f"\n⚠️  Delete {outlier_count:,} outliers? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Aborted. No changes made.")
            return 0

        # Delete outliers
        delete_sql = text("""
            DELETE FROM transactions
            WHERE price < :lower_bound OR price > :upper_bound
        """)

        db.session.execute(delete_sql, {'lower_bound': lower_bound, 'upper_bound': upper_bound})
        db.session.commit()

        after_count = db.session.query(Transaction).count()
        outliers_removed = before_count - after_count

        print(f"\n✅ Removed {outliers_removed:,} outliers")
        print(f"   Final clean records: {after_count:,}")

        return outliers_removed


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

    # Filter outliers
    outliers_excluded = filter_outliers_sql(app)

    if outliers_excluded > 0:
        # Trigger aggregation to update metadata
        print("\n" + "=" * 60)
        print("Recomputing aggregated statistics...")
        print("=" * 60)

        with app.app_context():
            recompute_all_stats(outliers_excluded=outliers_excluded)

        print("\n" + "=" * 60)
        print("✅ All done! Outliers filtered and stats recomputed.")
        print(f"   {outliers_excluded:,} outlier records removed")
        print("=" * 60)
    else:
        print("\n" + "=" * 60)
        print("No outliers were removed. Database unchanged.")
        print("=" * 60)


if __name__ == "__main__":
    main()
