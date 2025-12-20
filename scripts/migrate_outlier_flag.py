"""
Migration Script: Add is_outlier column and mark existing outliers

This script implements soft-delete for outliers:
1. Adds is_outlier BOOLEAN column to transactions table
2. Calculates IQR bounds
3. Marks outliers with is_outlier=true (instead of deleting them)
4. Updates metadata with outlier count

Run this script once after deployment to enable outlier tracking:
    python scripts/migrate_outlier_flag.py

After running this script:
- Outliers are kept in the database but marked with is_outlier=true
- Analytics queries exclude outliers via WHERE is_outlier = false
- /health endpoint shows accurate outlier count
- Frontend displays "xxx outlier records excluded" message
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from sqlalchemy import text
from config import Config
from models.database import db


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def main():
    """Main migration function"""
    print("=" * 70)
    print("MIGRATION: Add is_outlier column and mark outliers")
    print("=" * 70)

    app = create_app()

    with app.app_context():
        from models.transaction import Transaction
        from models.precomputed_stats import PreComputedStats

        # Step 1: Check if column exists
        print("\n[1/5] Checking if is_outlier column exists...")
        result = db.session.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'transactions' AND column_name = 'is_outlier'
        """)).fetchone()

        if result:
            print("  -> Column already exists")
        else:
            print("  -> Adding is_outlier column...")
            db.session.execute(text("""
                ALTER TABLE transactions
                ADD COLUMN is_outlier BOOLEAN DEFAULT false
            """))
            db.session.commit()
            print("  -> Column added successfully")

        # Step 2: Create index if not exists
        print("\n[2/5] Creating index on is_outlier...")
        try:
            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_transactions_is_outlier
                ON transactions (is_outlier)
            """))
            db.session.commit()
            print("  -> Index created")
        except Exception as e:
            print(f"  -> Index may already exist: {e}")
            db.session.rollback()

        # Step 3: Reset all records to non-outlier first
        print("\n[3/5] Resetting all records to non-outlier...")
        result = db.session.execute(text("""
            UPDATE transactions SET is_outlier = false
            WHERE is_outlier IS NULL OR is_outlier = true
        """))
        reset_count = result.rowcount
        db.session.commit()
        print(f"  -> Reset {reset_count:,} records")

        # Step 4: Calculate IQR and mark outliers
        print("\n[4/5] Calculating IQR bounds and marking outliers...")

        # Get total count
        total_count = db.session.query(Transaction).count()
        print(f"  -> Total records: {total_count:,}")

        # Calculate IQR bounds
        result = db.session.execute(text("""
            SELECT
                percentile_cont(0.25) WITHIN GROUP (ORDER BY price) as q1,
                percentile_cont(0.75) WITHIN GROUP (ORDER BY price) as q3
            FROM transactions
            WHERE price > 0
        """)).fetchone()

        if not result or result.q1 is None:
            print("  -> ERROR: Could not calculate IQR bounds")
            return

        q1, q3 = float(result.q1), float(result.q3)
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        print(f"  -> Q1: ${q1:,.0f}")
        print(f"  -> Q3: ${q3:,.0f}")
        print(f"  -> IQR: ${iqr:,.0f}")
        print(f"  -> Valid range: ${lower_bound:,.0f} to ${upper_bound:,.0f}")

        # Mark outliers
        result = db.session.execute(text("""
            UPDATE transactions
            SET is_outlier = true
            WHERE price < :lower_bound OR price > :upper_bound
        """), {'lower_bound': lower_bound, 'upper_bound': upper_bound})

        outlier_count = result.rowcount
        db.session.commit()
        print(f"  -> Marked {outlier_count:,} records as outliers")

        # Step 5: Update metadata
        print("\n[5/5] Updating metadata...")
        active_count = total_count - outlier_count

        # Get existing metadata or create new
        existing_metadata = PreComputedStats.get_stat('_metadata') or {}

        from datetime import datetime
        metadata = {
            **existing_metadata,
            'last_updated': datetime.utcnow().isoformat(),
            'row_count': active_count,
            'outliers_excluded': outlier_count,
            'total_records_removed': outlier_count,
            'iqr_stats': {
                'q1': q1,
                'q3': q3,
                'iqr': iqr,
                'lower_bound': lower_bound,
                'upper_bound': upper_bound
            },
            'migration_completed': datetime.utcnow().isoformat()
        }

        PreComputedStats.set_stat('_metadata', metadata, active_count)
        print(f"  -> Metadata updated with outlier_count={outlier_count:,}")

        # Summary
        print("\n" + "=" * 70)
        print("MIGRATION COMPLETE")
        print("=" * 70)
        print(f"\nSummary:")
        print(f"  - Total records in database: {total_count:,}")
        print(f"  - Active records (non-outliers): {active_count:,}")
        print(f"  - Outliers marked: {outlier_count:,}")
        print(f"  - Outlier percentage: {outlier_count/total_count*100:.2f}%")
        print(f"\nThe /health endpoint will now show:")
        print(f'  "outliers_excluded": {outlier_count}')
        print(f"\nFrontend will display:")
        print(f'  "{outlier_count:,} outlier records excluded"')
        print("=" * 70)


if __name__ == "__main__":
    main()
