#!/usr/bin/env python3
"""
Data Quality Verification Script
Runs diagnostic checks on recent ETL ingestion without modifying data.
"""

import sys
import os
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from sqlalchemy import create_engine, text
from config import Config

def run_verification():
    """Run all data quality checks"""

    print("=" * 80)
    print("ETL DATA QUALITY VERIFICATION")
    print("=" * 80)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print()

    engine = create_engine(Config.SQLALCHEMY_DATABASE_URI)

    with engine.connect() as conn:

        # ============================================================
        # 1. Check Recent Batch History
        # ============================================================
        print("\n" + "=" * 80)
        print("1. RECENT BATCH HISTORY (Last 10 batches)")
        print("=" * 80)

        batch_history = text("""
            SELECT
                batch_id,
                status,
                started_at,
                completed_at,
                rows_loaded,
                rows_after_dedup,
                rows_promoted,
                rows_outliers_marked,
                validation_passed,
                schema_version,
                rules_version
            FROM etl_batches
            ORDER BY started_at DESC
            LIMIT 10
        """)

        result = conn.execute(batch_history)
        rows = result.fetchall()

        if not rows:
            print("No batch records found!")
        else:
            print(f"\nFound {len(rows)} batches:\n")
            for row in rows:
                print(f"Batch ID: {row[0]}")
                print(f"  Status: {row[1]}")
                print(f"  Started: {row[2]}")
                print(f"  Completed: {row[3]}")
                print(f"  Rows Loaded: {row[4]}")
                print(f"  After Dedup: {row[5]}")
                print(f"  Promoted: {row[6]}")
                print(f"  Outliers Marked: {row[7]}")
                print(f"  Validation Passed: {row[8]}")
                print(f"  Schema Version: {row[9]}")
                print(f"  Rules Version: {row[10]}")
                print()

        # ============================================================
        # 2. Total Row Count
        # ============================================================
        print("\n" + "=" * 80)
        print("2. TRANSACTION TABLE STATS")
        print("=" * 80)

        total_count = text("SELECT COUNT(*) FROM transactions")
        result = conn.execute(total_count)
        total = result.scalar()
        print(f"\nTotal transactions: {total:,}")

        # ============================================================
        # 3. Check Staging Data Quality
        # ============================================================
        print("\n" + "=" * 80)
        print("3. STAGING DATA QUALITY")
        print("=" * 80)

        staging_check = text("""
            SELECT
                batch_id,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_valid) as valid,
                COUNT(*) FILTER (WHERE NOT is_valid) as invalid,
                COUNT(*) FILTER (WHERE is_outlier) as outliers
            FROM transactions_staging
            GROUP BY batch_id
            ORDER BY batch_id DESC
            LIMIT 5
        """)

        result = conn.execute(staging_check)
        staging_rows = result.fetchall()

        if not staging_rows:
            print("\nNo staging data found (clean state)")
        else:
            print(f"\nFound staging data for {len(staging_rows)} batches:\n")
            for row in staging_rows:
                print(f"Batch: {row[0]}")
                print(f"  Total: {row[1]}, Valid: {row[2]}, Invalid: {row[3]}, Outliers: {row[4]}")

        # ============================================================
        # 4. Verify row_hash Uniqueness
        # ============================================================
        print("\n" + "=" * 80)
        print("4. ROW HASH UNIQUENESS CHECK")
        print("=" * 80)

        duplicate_check = text("""
            SELECT row_hash, COUNT(*) as cnt
            FROM transactions
            WHERE row_hash IS NOT NULL
            GROUP BY row_hash
            HAVING COUNT(*) > 1
            LIMIT 10
        """)

        result = conn.execute(duplicate_check)
        duplicates = result.fetchall()

        if not duplicates:
            print("\n✓ No duplicate row_hash values found (good!)")
        else:
            print(f"\n✗ WARNING: Found {len(duplicates)} duplicate row_hash values:")
            for row in duplicates:
                print(f"  {row[0]}: {row[1]} occurrences")

        # ============================================================
        # 5. Semantic Assertions - PSF Consistency
        # ============================================================
        print("\n" + "=" * 80)
        print("5. PSF CONSISTENCY CHECK")
        print("=" * 80)

        psf_check = text("""
            SELECT
                COUNT(*) as total_with_psf,
                COUNT(*) FILTER (
                    WHERE psf_source IS NOT NULL
                    AND psf_calc IS NOT NULL
                    AND ABS(psf_source - psf_calc) / NULLIF(psf_calc, 0) > 0.05
                ) as high_mismatch_count,
                ROUND(AVG(ABS(psf_source - psf_calc) / NULLIF(psf_calc, 0) * 100), 2) as avg_mismatch_pct
            FROM transactions
            WHERE psf_source IS NOT NULL AND psf_calc IS NOT NULL
        """)

        result = conn.execute(psf_check)
        psf_row = result.fetchone()

        total_psf = psf_row[0]
        high_mismatch = psf_row[1]
        avg_mismatch = psf_row[2] or 0

        print(f"\nTotal rows with PSF data: {total_psf:,}")
        print(f"High mismatch (>5%): {high_mismatch:,}")
        print(f"Average mismatch: {avg_mismatch:.2f}%")

        if high_mismatch > total_psf * 0.5:
            print("✗ CRITICAL: >50% PSF mismatch detected!")
        elif high_mismatch > total_psf * 0.05:
            print("⚠ WARNING: >5% rows have high PSF mismatch")
        else:
            print("✓ PSF consistency looks good")

        # ============================================================
        # 6. District Range Validation
        # ============================================================
        print("\n" + "=" * 80)
        print("6. DISTRICT RANGE VALIDATION")
        print("=" * 80)

        district_check = text("""
            SELECT DISTINCT district
            FROM transactions
            WHERE district NOT IN (
                'D01','D02','D03','D04','D05','D06','D07','D08','D09','D10',
                'D11','D12','D13','D14','D15','D16','D17','D18','D19','D20',
                'D21','D22','D23','D24','D25','D26','D27','D28'
            )
            AND district IS NOT NULL
            ORDER BY district
        """)

        result = conn.execute(district_check)
        invalid_districts = result.fetchall()

        if not invalid_districts:
            print("\n✓ All districts are within valid range (D01-D28)")
        else:
            print(f"\n✗ WARNING: Found {len(invalid_districts)} invalid district codes:")
            for row in invalid_districts:
                print(f"  {row[0]}")

        # ============================================================
        # 7. Price/PSF/Area Ranges
        # ============================================================
        print("\n" + "=" * 80)
        print("7. PRICE/PSF/AREA RANGE CHECK")
        print("=" * 80)

        range_check = text("""
            SELECT
                MIN(price) as min_price,
                MAX(price) as max_price,
                MIN(psf) as min_psf,
                MAX(psf) as max_psf,
                MIN(area_sqft) as min_area,
                MAX(area_sqft) as max_area,
                COUNT(*) FILTER (WHERE price < 100000) as suspiciously_low_price,
                COUNT(*) FILTER (WHERE price > 50000000) as suspiciously_high_price,
                COUNT(*) FILTER (WHERE psf < 100) as suspiciously_low_psf,
                COUNT(*) FILTER (WHERE psf > 10000) as suspiciously_high_psf
            FROM transactions
            WHERE COALESCE(is_outlier, false) = false
        """)

        result = conn.execute(range_check)
        range_row = result.fetchone()

        print(f"\nPrice range: ${range_row[0]:,.0f} - ${range_row[1]:,.0f}")
        print(f"PSF range: ${range_row[2]:,.0f} - ${range_row[3]:,.0f}")
        print(f"Area range: {range_row[4]:,.0f} - {range_row[5]:,.0f} sqft")
        print(f"\nSuspicious values (non-outliers):")
        print(f"  Low price (<$100k): {range_row[6]:,}")
        print(f"  High price (>$50M): {range_row[7]:,}")
        print(f"  Low PSF (<$100): {range_row[8]:,}")
        print(f"  High PSF (>$10k): {range_row[9]:,}")

        # ============================================================
        # 8. Null Rates for Required Fields
        # ============================================================
        print("\n" + "=" * 80)
        print("8. NULL RATES FOR REQUIRED FIELDS")
        print("=" * 80)

        null_check = text("""
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE project_name IS NULL) as null_project,
                COUNT(*) FILTER (WHERE transaction_date IS NULL) as null_date,
                COUNT(*) FILTER (WHERE price IS NULL) as null_price,
                COUNT(*) FILTER (WHERE area_sqft IS NULL) as null_area,
                ROUND(COUNT(*) FILTER (WHERE project_name IS NULL)::numeric / COUNT(*) * 100, 2) as pct_null_project,
                ROUND(COUNT(*) FILTER (WHERE transaction_date IS NULL)::numeric / COUNT(*) * 100, 2) as pct_null_date,
                ROUND(COUNT(*) FILTER (WHERE price IS NULL)::numeric / COUNT(*) * 100, 2) as pct_null_price,
                ROUND(COUNT(*) FILTER (WHERE area_sqft IS NULL)::numeric / COUNT(*) * 100, 2) as pct_null_area
            FROM transactions
        """)

        result = conn.execute(null_check)
        null_row = result.fetchone()

        print(f"\nTotal rows: {null_row[0]:,}")
        print(f"Null project_name: {null_row[1]:,} ({null_row[5]}%)")
        print(f"Null transaction_date: {null_row[2]:,} ({null_row[6]}%)")
        print(f"Null price: {null_row[3]:,} ({null_row[7]}%)")
        print(f"Null area_sqft: {null_row[4]:,} ({null_row[8]}%)")

        if any(null_row[5:9]) and max(null_row[5:9] or [0]) > 0.1:
            print("\n✗ WARNING: Required field null rate exceeds 0.1%")
        else:
            print("\n✓ Required field null rates are acceptable")

        # ============================================================
        # 9. Outlier Counts
        # ============================================================
        print("\n" + "=" * 80)
        print("9. OUTLIER ANALYSIS")
        print("=" * 80)

        outlier_check = text("""
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_outlier = true) as outliers,
                ROUND(COUNT(*) FILTER (WHERE is_outlier = true)::numeric / COUNT(*) * 100, 2) as outlier_pct,
                COUNT(*) FILTER (WHERE is_outlier = true AND area_sqft > 10000) as enblocsales,
                COUNT(*) FILTER (WHERE is_outlier = true AND area_sqft <= 10000) as price_outliers
            FROM transactions
        """)

        result = conn.execute(outlier_check)
        outlier_row = result.fetchone()

        print(f"\nTotal transactions: {outlier_row[0]:,}")
        print(f"Outliers: {outlier_row[1]:,} ({outlier_row[2]}%)")
        print(f"  En-bloc sales (area >10k sqft): {outlier_row[3]:,}")
        print(f"  Price outliers (5x IQR): {outlier_row[4]:,}")

        # ============================================================
        # 10. Date Range Coverage
        # ============================================================
        print("\n" + "=" * 80)
        print("10. DATE RANGE COVERAGE")
        print("=" * 80)

        date_check = text("""
            SELECT
                MIN(transaction_date) as earliest,
                MAX(transaction_date) as latest,
                COUNT(DISTINCT DATE_TRUNC('month', transaction_date)) as unique_months,
                COUNT(*) FILTER (WHERE transaction_date > CURRENT_DATE) as future_dates
            FROM transactions
        """)

        result = conn.execute(date_check)
        date_row = result.fetchone()

        print(f"\nEarliest transaction: {date_row[0]}")
        print(f"Latest transaction: {date_row[1]}")
        print(f"Unique months covered: {date_row[2]:,}")
        print(f"Future dates (should be 0): {date_row[3]:,}")

        if date_row[3] > 0:
            print("\n✗ WARNING: Future dates detected!")
        else:
            print("\n✓ No future dates found")

        # ============================================================
        # 11. Most Recent Batch Details
        # ============================================================
        print("\n" + "=" * 80)
        print("11. MOST RECENT BATCH DETAILS")
        print("=" * 80)

        recent_batch = text("""
            SELECT
                batch_id,
                status,
                started_at,
                completed_at,
                rows_loaded,
                rows_after_dedup,
                rows_promoted,
                rows_outliers_marked,
                validation_passed,
                validation_issues,
                semantic_warnings,
                file_fingerprints,
                contract_report
            FROM etl_batches
            ORDER BY started_at DESC
            LIMIT 1
        """)

        result = conn.execute(recent_batch)
        batch = result.fetchone()

        if batch:
            print(f"\nBatch ID: {batch[0]}")
            print(f"Status: {batch[1]}")
            print(f"Started: {batch[2]}")
            print(f"Completed: {batch[3]}")
            print(f"Rows Loaded: {batch[4]:,}")
            print(f"After Dedup: {batch[5]:,}")
            print(f"Promoted: {batch[6]:,}")
            print(f"Outliers Marked: {batch[7]:,}")
            print(f"Validation Passed: {batch[8]}")

            if batch[9]:
                print(f"\nValidation Issues:")
                print(f"  {batch[9]}")

            if batch[10]:
                print(f"\nSemantic Warnings:")
                print(f"  {batch[10]}")

            if batch[11]:
                print(f"\nFile Fingerprints:")
                print(f"  {batch[11]}")

            if batch[12]:
                print(f"\nContract Report:")
                print(f"  {batch[12]}")

    print("\n" + "=" * 80)
    print("VERIFICATION COMPLETE")
    print("=" * 80)
    print()

if __name__ == "__main__":
    try:
        run_verification()
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
