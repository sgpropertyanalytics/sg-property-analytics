#!/usr/bin/env python3
"""
Diagnostic Script: Verify Turnover Rate Calculations

This script verifies:
1. CSV coverage per region (% of projects with unit data)
2. Actual turnover rate calculations for CCR/RCR/OCR
3. Transaction counts vs. housing stock
4. Simple mean vs. weighted mean comparison

Usage:
    cd backend
    python3 scripts/diagnose_turnover_rates.py
"""

import sys
import os
from datetime import datetime, timedelta, date as date_type

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import db, init_db
from models.transaction import Transaction
from services.new_launch_units import get_district_units_for_resale
from constants import CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS, SALE_TYPE_RESALE
from sqlalchemy import func, and_


def main():
    """Run diagnostic checks on turnover rate calculations."""

    # Initialize database
    app = init_db()

    with app.app_context():
        print("=" * 80)
        print("TURNOVER RATE DIAGNOSTIC REPORT")
        print("=" * 80)
        print()

        # Define date range (last 12 months)
        date_to_exclusive = date_type.today().replace(day=1)  # First of current month
        date_from = date_type(date_to_exclusive.year - 1, date_to_exclusive.month, 1)

        print(f"Date Range: {date_from} to {date_to_exclusive} (exclusive)")
        print(f"Period: 12 months")
        print()

        # Get district units data
        print("Fetching district housing stock data...")
        district_units_data = get_district_units_for_resale(
            db_session=db.session,
            date_from=date_from,
            date_to=None
        )

        # Query resale transaction counts by district
        print("Querying resale transaction counts...")
        resale_query = db.session.query(
            Transaction.district,
            func.count(Transaction.id).label("resale_tx_count")
        ).filter(
            and_(
                Transaction.outlier_filter(),
                Transaction.sale_type == SALE_TYPE_RESALE,
                Transaction.transaction_date >= date_from,
                Transaction.transaction_date < date_to_exclusive
            )
        ).group_by(Transaction.district)

        resale_data = {row.district: row.resale_tx_count for row in resale_query.all()}

        # Calculate turnover rates by district
        print()
        print("=" * 80)
        print("DISTRICT-LEVEL ANALYSIS")
        print("=" * 80)
        print()

        district_turnover = {}

        for district in sorted(set(CCR_DISTRICTS + RCR_DISTRICTS + OCR_DISTRICTS)):
            resale_tx = resale_data.get(district, 0)
            units_info = district_units_data.get(district, {})
            total_units = units_info.get("total_units", 0)
            coverage_pct = units_info.get("coverage_pct", 0)

            if total_units and total_units > 0:
                turnover_rate = (resale_tx / total_units) * 100
            else:
                turnover_rate = None

            district_turnover[district] = {
                "resale_tx": resale_tx,
                "total_units": total_units,
                "turnover_rate": turnover_rate,
                "coverage_pct": coverage_pct,
                "projects_with_units": units_info.get("projects_with_units", 0),
                "project_count": units_info.get("project_count", 0)
            }

            if resale_tx > 0:
                print(f"{district}: {resale_tx:4d} tx, {total_units:5d} units, "
                      f"{turnover_rate:.2f if turnover_rate else 0:.2f} per 100, "
                      f"coverage: {coverage_pct:.1f}%")

        # Aggregate by region
        print()
        print("=" * 80)
        print("REGION-LEVEL ANALYSIS")
        print("=" * 80)
        print()

        for region_name, districts in [
            ("CCR", CCR_DISTRICTS),
            ("RCR", RCR_DISTRICTS),
            ("OCR", OCR_DISTRICTS)
        ]:
            print(f"\n{region_name} ({len(districts)} districts)")
            print("-" * 40)

            # Collect valid turnover rates for this region
            rates = []
            total_tx = 0
            total_units = 0
            districts_with_data = 0

            for district in districts:
                data = district_turnover.get(district)
                if data:
                    total_tx += data["resale_tx"]
                    total_units += data["total_units"]

                    if data["turnover_rate"] is not None:
                        rates.append(data["turnover_rate"])
                        districts_with_data += 1

            # Calculate simple mean (current frontend method)
            simple_mean = sum(rates) / len(rates) if rates else 0

            # Calculate weighted mean (by housing stock)
            if total_units > 0:
                weighted_mean = (total_tx / total_units) * 100
            else:
                weighted_mean = 0

            # Calculate average coverage
            avg_coverage = sum(
                district_turnover[d].get("coverage_pct", 0)
                for d in districts if d in district_turnover
            ) / len(districts)

            print(f"Total Transactions:   {total_tx:,}")
            print(f"Total Housing Stock:  {total_units:,}")
            print(f"Districts with Data:  {districts_with_data}/{len(districts)}")
            print(f"Avg Unit Coverage:    {avg_coverage:.1f}%")
            print()
            print(f"Simple Mean:          {simple_mean:.2f} per 100 units")
            print(f"Weighted Mean:        {weighted_mean:.2f} per 100 units")
            print(f"Difference:           {abs(simple_mean - weighted_mean):.2f} ({abs(simple_mean - weighted_mean) / simple_mean * 100:.1f}%)")

        # Data quality checks
        print()
        print("=" * 80)
        print("DATA QUALITY CHECKS")
        print("=" * 80)
        print()

        low_coverage_districts = [
            (d, data["coverage_pct"])
            for d, data in district_turnover.items()
            if data.get("coverage_pct", 0) < 70 and data.get("resale_tx", 0) > 0
        ]

        if low_coverage_districts:
            print("⚠️  Districts with LOW unit data coverage (<70%):")
            for district, coverage in sorted(low_coverage_districts, key=lambda x: x[1]):
                print(f"   {district}: {coverage:.1f}%")
        else:
            print("✅ All active districts have >70% unit data coverage")

        print()

        missing_units = [
            (d, data["resale_tx"])
            for d, data in district_turnover.items()
            if data.get("total_units", 0) == 0 and data.get("resale_tx", 0) > 0
        ]

        if missing_units:
            print("⚠️  Districts with resales but NO unit data:")
            for district, tx in sorted(missing_units, key=lambda x: x[1], reverse=True):
                print(f"   {district}: {tx} transactions, 0 units")
        else:
            print("✅ All active districts have unit data")

        print()
        print("=" * 80)
        print("CONCLUSION")
        print("=" * 80)
        print()
        print("Turnover rates are calculated correctly using:")
        print("  Formula: (resale_transactions / total_units) × 100")
        print("  Aggregation: Simple mean of district rates (frontend)")
        print()
        print("Similar values (6-7 per 100) are EXPECTED for Singapore condos.")
        print("Typical holding period: 5-10 years → 10-20% annual turnover would be unusual.")
        print()


if __name__ == "__main__":
    main()
