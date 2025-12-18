"""
Recompute Stats Script - Re-runs data computation to update pre-computed stats

This can be run:
1. Manually: python scripts/recompute_stats.py
2. Via cron: Add to crontab for scheduled updates
3. Via API: Can be triggered via admin endpoint

Pipeline: Load Raw → Validate/Filter → Store in DB → **Compute Stats**
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from config import Config
from models.database import db
from services.data_computation import recompute_all_stats, get_metadata


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def main():
    """Main recomputation function"""
    print("=" * 60)
    print("Recomputing Pre-Computed Analytics")
    print("=" * 60)

    app = create_app()

    with app.app_context():
        from models.transaction import Transaction

        count = db.session.query(Transaction).count()

        if count == 0:
            print("\n❌ No transactions found in database.")
            print("   Please run: python scripts/upload.py first")
            return

        # Preserve existing outliers_excluded count from metadata
        existing_metadata = get_metadata()
        outliers_excluded = existing_metadata.get('outliers_excluded', 0)

        print(f"\n📊 Found {count:,} transactions in database")
        if outliers_excluded > 0:
            print(f"   Preserving outliers_excluded count: {outliers_excluded:,}")
        print("   Starting data computation...\n")

        recompute_all_stats(outliers_excluded=outliers_excluded)

        print("\n" + "=" * 60)
        print("✓ Data computation complete!")
        print("=" * 60)


if __name__ == "__main__":
    main()

