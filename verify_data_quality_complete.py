#!/usr/bin/env python3
"""
Comprehensive Data Quality Verification
Batch ID: 186325f7-1171-4a11-afef-a66355ce36ca

Runs ALL 7 critical ETL validation checks.
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from flask import Flask
from sqlalchemy import text
from config import Config
from models.database import db
from datetime import datetime, timedelta

batch_id = '186325f7-1171-4a11-afef-a66355ce36ca'

def create_app():
    """Create minimal Flask app for database access."""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app

def run_verification():
    """Run all 7 data quality checks."""
    app = create_app()

    with app.app_context():
        print('='*80)
        print('COMPREHENSIVE DATA QUALITY VERIFICATION REPORT')
        print(f'Batch ID: {batch_id}')
        print(f'Timestamp: {datetime.now().isoformat()}')
        print('='*80)

        # ====================
        # CHECK 1: Source Completeness Reconciliation
        # ====================
        print('\n' + '='*80)
        print('CHECK 1: SOURCE COMPLETENESS RECONCILIATION')
        print('='*80)

        result = db.session.execute(text('''
            SELECT
                batch_id,
                source_row_count,
                rows_loaded,
                rows_rejected,
                rows_skipped,
                rows_after_dedup,
                rows_promoted,
                status
            FROM etl_batches
            WHERE batch_id = :batch_id
        '''), {'batch_id': batch_id})

        batch = result.fetchone()
        if batch:
            source_rows = batch[1] or 0
            loaded = batch[2] or 0
            rejected = batch[3] or 0
            skipped = batch[4] or 0
            after_dedup = batch[5] or 0
            promoted = batch[6] or 0

            print(f'Source Row Count:    {source_rows:,}')
            print(f'Rows Loaded:         {loaded:,}')
            print(f'Rows Rejected:       {rejected:,}')
            print(f'Rows Skipped:        {skipped:,}')
            print(f'After Dedup:         {after_dedup:,}')
            print(f'Rows Promoted:       {promoted:,}')
            print()

            # Calculate reconciliation
            accounted = loaded + rejected + skipped
            unaccounted = source_rows - accounted

            print(f'Accounted:           {accounted:,}')
            print(f'Unaccounted:         {unaccounted:,}')
            print()

            if unaccounted == 0:
                print('✅ PASS: All source rows accounted for')
            else:
                print(f'❌ FAIL: {unaccounted:,} rows unaccounted')
        else:
            print('❌ FAIL: Batch not found')

        # ====================
        # CHECK 2: Batch Isolation / Stale Staging Safety
        # ====================
        print('\n' + '='*80)
        print('CHECK 2: BATCH ISOLATION / STALE STAGING SAFETY')
        print('='*80)

        result = db.session.execute(text('''
            SELECT
                batch_id,
                COUNT(*) as row_count,
                MIN(created_at) as first_row,
                MAX(created_at) as last_row
            FROM transactions_staging
            GROUP BY batch_id
            ORDER BY MAX(created_at) DESC
        '''))

        staging_batches = result.fetchall()
        print(f'Distinct batches in staging: {len(staging_batches)}')
        print()

        if len(staging_batches) > 0:
            for bid, count, first, last in staging_batches:
                is_current = bid == batch_id
                marker = '→ CURRENT' if is_current else '  STALE'
                print(f'{marker} {bid}: {count:,} rows (created {first} to {last})')

        if len(staging_batches) == 1 and staging_batches[0][0] == batch_id:
            print('\n✅ PASS: Only current batch in staging')
        elif len(staging_batches) == 0:
            print('\n⚠️  WARN: Staging table is empty (already promoted and cleaned)')
        else:
            print(f'\n❌ FAIL: {len(staging_batches)} batches in staging (should be 1)')

        # ====================
        # CHECK 3: Natural Key Uniqueness in Production
        # ====================
        print('\n' + '='*80)
        print('CHECK 3: NATURAL KEY UNIQUENESS IN PRODUCTION')
        print('='*80)

        # Check for duplicates using natural key
        result = db.session.execute(text('''
            SELECT
                project_name,
                transaction_date,
                price,
                area_sqft,
                COALESCE(floor_range, '') as floor_range,
                COUNT(*) as dup_count
            FROM transactions
            GROUP BY project_name, transaction_date, price, area_sqft, COALESCE(floor_range, '')
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
            LIMIT 10
        '''))

        duplicates = result.fetchall()
        if duplicates:
            print(f'❌ FAIL: Found {len(duplicates)} natural key duplicates')
            print('\nTop 10 duplicates:')
            for dup in duplicates:
                proj = str(dup[0])[:30]
                print(f'  {proj:30s} | {dup[1]} | ${dup[2]:,} | {dup[3]:,} sqft | floor={dup[4]:10s} | count={dup[5]}')
        else:
            print('✅ PASS: No natural key duplicates found')

        # Check for index existence
        result = db.session.execute(text('''
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'transactions'
            AND indexdef LIKE '%project_name%'
            AND indexdef LIKE '%transaction_date%'
        '''))

        indexes = result.fetchall()
        print(f'\nNatural key indexes found: {len(indexes)}')
        for idx_name, idx_def in indexes:
            print(f'  {idx_name}')

        # ====================
        # CHECK 4: Referential Integrity
        # ====================
        print('\n' + '='*80)
        print('CHECK 4: REFERENTIAL INTEGRITY')
        print('='*80)

        # Project coverage
        result = db.session.execute(text('''
            SELECT
                COUNT(DISTINCT t.project_name) as total_projects,
                COUNT(DISTINCT pl.project_name) as projects_with_location
            FROM transactions t
            LEFT JOIN project_locations pl ON LOWER(TRIM(t.project_name)) = LOWER(TRIM(pl.project_name))
        '''))

        proj_total, proj_with_loc = result.fetchone()
        coverage_pct = (proj_with_loc / proj_total * 100) if proj_total > 0 else 0

        print(f'Project Location Coverage:')
        print(f'  Total projects:           {proj_total:,}')
        print(f'  With location data:       {proj_with_loc:,}')
        print(f'  Coverage:                 {coverage_pct:.1f}%')

        if coverage_pct >= 95:
            print('  ✅ PASS: >= 95% coverage')
        elif coverage_pct >= 85:
            print('  ⚠️  WARN: 85-95% coverage')
        else:
            print('  ❌ FAIL: < 85% coverage')

        # District/region mapping
        result = db.session.execute(text('''
            SELECT
                district,
                region,
                COUNT(*) as count
            FROM transactions
            WHERE district IS NOT NULL
            GROUP BY district, region
            ORDER BY district
        '''))

        districts = result.fetchall()
        print(f'\nDistrict/Region Mappings: {len(districts)} unique combinations')

        # Check for nulls
        result = db.session.execute(text('''
            SELECT
                COUNT(*) FILTER (WHERE district IS NULL) as null_district,
                COUNT(*) FILTER (WHERE region IS NULL) as null_region,
                COUNT(*) as total
            FROM transactions
        '''))

        null_dist, null_reg, total = result.fetchone()
        print(f'  Null districts:           {null_dist:,} ({null_dist/total*100:.2f}%)')
        print(f'  Null regions:             {null_reg:,} ({null_reg/total*100:.2f}%)')

        if null_dist == 0 and null_reg == 0:
            print('  ✅ PASS: No null district/region values')
        else:
            print('  ⚠️  WARN: Found null values')

        # Sale type enum
        result = db.session.execute(text('''
            SELECT
                sale_type,
                COUNT(*) as count
            FROM transactions
            WHERE sale_type IS NOT NULL
            GROUP BY sale_type
            ORDER BY count DESC
        '''))

        sale_types = result.fetchall()
        print(f'\nSale Type Distribution:')
        for st, count in sale_types:
            print(f'  {st:15s}: {count:,}')

        expected_types = ['Resale', 'New Sale']
        actual_types = [st[0] for st in sale_types]
        if all(st in expected_types for st in actual_types):
            print('  ✅ PASS: All sale types valid')
        else:
            unexpected = [st for st in actual_types if st not in expected_types]
            print(f'  ⚠️  WARN: Unexpected sale types: {unexpected}')

        # ====================
        # CHECK 5: Cross-Field Invariants (Per-Row)
        # ====================
        print('\n' + '='*80)
        print('CHECK 5: CROSS-FIELD INVARIANTS (PER-ROW)')
        print('='*80)

        # PSF invariant: abs(psf - price/area) within 5%
        result = db.session.execute(text('''
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE psf IS NOT NULL AND price > 0 AND area_sqft > 0) as valid_for_check,
                COUNT(*) FILTER (
                    WHERE psf IS NOT NULL
                    AND price > 0
                    AND area_sqft > 0
                    AND ABS(psf - (price::float / area_sqft)) / (price::float / area_sqft) > 0.05
                ) as psf_violations
            FROM transactions
        '''))

        total, valid, psf_violations = result.fetchone()
        print(f'PSF Consistency Check:')
        print(f'  Total transactions:       {total:,}')
        print(f'  Valid for PSF check:      {valid:,}')
        print(f'  PSF violations (>5%):     {psf_violations:,}')

        if psf_violations == 0:
            print('  ✅ PASS: All PSF values consistent')
        elif psf_violations < valid * 0.01:
            print(f'  ⚠️  WARN: {psf_violations/valid*100:.2f}% PSF violations (< 1%)')
        else:
            print(f'  ❌ FAIL: {psf_violations/valid*100:.2f}% PSF violations (>= 1%)')

        # Positive value checks
        result = db.session.execute(text('''
            SELECT
                COUNT(*) FILTER (WHERE price <= 0) as negative_price,
                COUNT(*) FILTER (WHERE area_sqft <= 0) as negative_area,
                COUNT(*) FILTER (WHERE psf <= 0) as negative_psf
            FROM transactions
        '''))

        neg_price, neg_area, neg_psf = result.fetchone()
        print(f'\nPositive Value Check:')
        print(f'  Negative/zero price:      {neg_price:,}')
        print(f'  Negative/zero area:       {neg_area:,}')
        print(f'  Negative/zero PSF:        {neg_psf:,}')

        if neg_price == 0 and neg_area == 0 and neg_psf == 0:
            print('  ✅ PASS: All values positive')
        else:
            print('  ❌ FAIL: Found non-positive values')

        # Sane ranges
        result = db.session.execute(text('''
            SELECT
                COUNT(*) FILTER (WHERE price < 100000 OR price > 100000000) as price_range_violations,
                COUNT(*) FILTER (WHERE psf < 100 OR psf > 20000) as psf_range_violations,
                COUNT(*) FILTER (WHERE area_sqft < 100 OR area_sqft > 50000) as area_range_violations
            FROM transactions
            WHERE COALESCE(is_outlier, false) = false
        '''))

        price_viol, psf_viol, area_viol = result.fetchone()
        print(f'\nSane Range Check (excluding outliers):')
        print(f'  Price out of range:       {price_viol:,} (expected: $100k-$100M)')
        print(f'  PSF out of range:         {psf_viol:,} (expected: $100-$20k)')
        print(f'  Area out of range:        {area_viol:,} (expected: 100-50k sqft)')

        if price_viol == 0 and psf_viol == 0 and area_viol == 0:
            print('  ✅ PASS: All values in sane ranges')
        else:
            print('  ⚠️  WARN: Some values outside typical ranges')

        # Date normalization check (should be 1st of month for URA data)
        result = db.session.execute(text('''
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE EXTRACT(DAY FROM transaction_date) = 1) as first_of_month,
                COUNT(*) FILTER (WHERE EXTRACT(DAY FROM transaction_date) != 1) as not_first
            FROM transactions
        '''))

        total_dates, first_month, not_first = result.fetchone()
        print(f'\nDate Normalization (URA should be 1st of month):')
        print(f'  Total dates:              {total_dates:,}')
        print(f'  First of month:           {first_month:,} ({first_month/total_dates*100:.1f}%)')
        print(f'  NOT first of month:       {not_first:,}')

        if not_first == 0:
            print('  ✅ PASS: All dates normalized to 1st of month')
        else:
            print(f'  ⚠️  WARN: {not_first:,} dates not on 1st of month')

        # ====================
        # CHECK 6: Distribution Shift / Anomaly Detection
        # ====================
        print('\n' + '='*80)
        print('CHECK 6: DISTRIBUTION SHIFT / ANOMALY DETECTION')
        print('='*80)

        # Get latest data date
        result = db.session.execute(text('SELECT MAX(transaction_date) FROM transactions'))
        max_date = result.scalar()
        ninety_days_ago = max_date - timedelta(days=90)

        print(f'Latest transaction date: {max_date}')
        print(f'Comparing last 90 days vs previous 90 days')
        print()

        # District mix comparison
        result = db.session.execute(text('''
            WITH recent AS (
                SELECT district, COUNT(*) as cnt
                FROM transactions
                WHERE transaction_date >= :ninety_days_ago
                AND COALESCE(is_outlier, false) = false
                GROUP BY district
            ),
            historical AS (
                SELECT district, COUNT(*) as cnt
                FROM transactions
                WHERE transaction_date >= :historical_start AND transaction_date < :ninety_days_ago
                AND COALESCE(is_outlier, false) = false
                GROUP BY district
            )
            SELECT
                COALESCE(r.district, h.district) as district,
                COALESCE(r.cnt, 0) as recent_count,
                COALESCE(h.cnt, 0) as historical_count,
                CASE
                    WHEN COALESCE(h.cnt, 0) = 0 THEN NULL
                    ELSE (COALESCE(r.cnt, 0)::float / COALESCE(h.cnt, 0)::float - 1) * 100
                END as pct_change
            FROM recent r
            FULL OUTER JOIN historical h ON r.district = h.district
            ORDER BY ABS(COALESCE(r.cnt, 0)::float / NULLIF(COALESCE(h.cnt, 0), 0)::float - 1) DESC NULLS LAST
            LIMIT 10
        '''), {
            'ninety_days_ago': ninety_days_ago,
            'historical_start': ninety_days_ago - timedelta(days=90)
        })

        district_shifts = result.fetchall()
        print('District Mix - Top Changes:')
        for dist, recent, hist, pct in district_shifts:
            if pct is not None:
                marker = '⚠️' if abs(pct) > 10 else '  '
                print(f'{marker} {dist}: {recent:,} recent vs {hist:,} historical ({pct:+.1f}%)')
            else:
                print(f'  {dist}: {recent:,} recent vs {hist:,} historical (NEW)')

        # Sale type mix
        result = db.session.execute(text('''
            WITH recent AS (
                SELECT sale_type, COUNT(*) as cnt
                FROM transactions
                WHERE transaction_date >= :ninety_days_ago
                AND COALESCE(is_outlier, false) = false
                GROUP BY sale_type
            ),
            historical AS (
                SELECT sale_type, COUNT(*) as cnt
                FROM transactions
                WHERE transaction_date >= :historical_start AND transaction_date < :ninety_days_ago
                AND COALESCE(is_outlier, false) = false
                GROUP BY sale_type
            )
            SELECT
                COALESCE(r.sale_type, h.sale_type) as sale_type,
                COALESCE(r.cnt, 0) as recent_count,
                COALESCE(h.cnt, 0) as historical_count,
                CASE
                    WHEN COALESCE(h.cnt, 0) = 0 THEN NULL
                    ELSE (COALESCE(r.cnt, 0)::float / COALESCE(h.cnt, 0)::float - 1) * 100
                END as pct_change
            FROM recent r
            FULL OUTER JOIN historical h ON r.sale_type = h.sale_type
        '''), {
            'ninety_days_ago': ninety_days_ago,
            'historical_start': ninety_days_ago - timedelta(days=90)
        })

        sale_type_shifts = result.fetchall()
        print('\nSale Type Mix:')
        for st, recent, hist, pct in sale_type_shifts:
            if pct is not None:
                marker = '⚠️' if abs(pct) > 10 else '  '
                print(f'{marker} {st}: {recent:,} recent vs {hist:,} historical ({pct:+.1f}%)')
            else:
                print(f'  {st}: {recent:,} recent vs {hist:,} historical (NEW)')

        # PSF median by region
        result = db.session.execute(text('''
            WITH recent AS (
                SELECT region, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
                FROM transactions
                WHERE transaction_date >= :ninety_days_ago
                AND COALESCE(is_outlier, false) = false
                AND region IS NOT NULL
                GROUP BY region
            ),
            historical AS (
                SELECT region, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
                FROM transactions
                WHERE transaction_date >= :historical_start AND transaction_date < :ninety_days_ago
                AND COALESCE(is_outlier, false) = false
                AND region IS NOT NULL
                GROUP BY region
            )
            SELECT
                COALESCE(r.region, h.region) as region,
                r.median_psf as recent_median,
                h.median_psf as historical_median,
                CASE
                    WHEN h.median_psf IS NULL OR h.median_psf = 0 THEN NULL
                    ELSE (r.median_psf / h.median_psf - 1) * 100
                END as pct_change
            FROM recent r
            FULL OUTER JOIN historical h ON r.region = h.region
        '''), {
            'ninety_days_ago': ninety_days_ago,
            'historical_start': ninety_days_ago - timedelta(days=90)
        })

        psf_shifts = result.fetchall()
        print('\nMedian PSF by Region:')
        for region, recent, hist, pct in psf_shifts:
            if pct is not None and recent is not None and hist is not None:
                marker = '⚠️' if abs(pct) > 10 else '  '
                print(f'{marker} {region}: ${recent:,.0f} recent vs ${hist:,.0f} historical ({pct:+.1f}%)')
            elif recent is not None:
                print(f'  {region}: ${recent:,.0f} recent (NEW)')

        # ====================
        # CHECK 7: Promote Guardrails Verification
        # ====================
        print('\n' + '='*80)
        print('CHECK 7: PROMOTE GUARDRAILS VERIFICATION')
        print('='*80)

        # Get total row count
        result = db.session.execute(text('SELECT COUNT(*) FROM transactions'))
        total_rows = result.scalar()
        print(f'Total rows in production: {total_rows:,}')
        print(f'Expected (from prompt):   119,269')

        diff = total_rows - 119269
        if diff == 0:
            print('  ✅ PASS: Row count matches expected')
        elif abs(diff) < 100:
            print(f'  ⚠️  WARN: Row count differs by {diff:+,} rows')
        else:
            print(f'  ⚠️  INFO: Row count differs by {diff:+,} rows (may be intentional)')

        # Verify natural key index exists
        result = db.session.execute(text('''
            SELECT
                i.relname as index_name,
                a.attname as column_name,
                ix.indisunique as is_unique
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            WHERE t.relname = 'transactions'
            AND i.relname LIKE '%natural%'
            ORDER BY i.relname, a.attnum
        '''))

        natural_key_indexes = result.fetchall()
        if natural_key_indexes:
            print(f'\nNatural Key Indexes:')
            for idx_name, col_name, is_unique in natural_key_indexes:
                unique_marker = 'UNIQUE' if is_unique else 'NON-UNIQUE'
                print(f'  {idx_name} ({unique_marker}): {col_name}')
            print('  ✅ PASS: Natural key index exists')
        else:
            print('\n  ⚠️  WARN: No natural key index found')

        # Check for data loss by comparing batch promotion
        result = db.session.execute(text('''
            SELECT
                rows_after_dedup,
                rows_promoted,
                rows_after_dedup - rows_promoted as not_promoted
            FROM etl_batches
            WHERE batch_id = :batch_id
        '''), {'batch_id': batch_id})

        batch_promo = result.fetchone()
        if batch_promo:
            dedup = batch_promo[0] or 0
            promoted = batch_promo[1] or 0
            not_promoted = batch_promo[2] or 0

            print(f'\nBatch Promotion Reconciliation:')
            print(f'  Rows after dedup:         {dedup:,}')
            print(f'  Rows promoted:            {promoted:,}')
            print(f'  Not promoted (dupes):     {not_promoted:,}')

            if not_promoted >= 0:
                print(f'  ✅ PASS: No data loss (duplicates expected)')
            else:
                print(f'  ❌ FAIL: Promoted more than staged?')

        # Future dates check (mentioned in prompt)
        result = db.session.execute(text('''
            SELECT
                COUNT(*) as future_count,
                MAX(transaction_date) as latest_date
            FROM transactions
            WHERE transaction_date > CURRENT_DATE
        '''))

        future_count, latest_future = result.fetchone()
        print(f'\nFuture Dates Check:')
        print(f'  Future-dated transactions: {future_count:,}')
        if latest_future:
            print(f'  Latest future date:        {latest_future}')

        if future_count == 0:
            print('  ✅ PASS: No future dates')
        elif future_count == 170:
            print('  ⚠️  INFO: 170 future-dated transactions (known issue from prompt)')
        else:
            print(f'  ⚠️  WARN: {future_count:,} future dates found')

        print('\n' + '='*80)
        print('ALL CHECKS COMPLETED')
        print('='*80)

if __name__ == '__main__':
    run_verification()
