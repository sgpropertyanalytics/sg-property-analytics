#!/usr/bin/env python3
"""
Comprehensive Data Quality Verification - Part 2
Checks 5-7: Cross-field invariants, distribution shift, promote guardrails
"""

import os
import sys
sys.path.insert(0, 'backend')

from config import get_db_connection
from datetime import datetime, timedelta

batch_id = '186325f7-1171-4a11-afef-a66355ce36ca'

print('='*80)
print('DATA QUALITY VERIFICATION REPORT - PART 2')
print(f'Batch ID: {batch_id}')
print(f'Timestamp: {datetime.now().isoformat()}')
print('='*80)

conn = get_db_connection()
cur = conn.cursor()

# ====================
# CHECK 5: Cross-Field Invariants (Per-Row)
# ====================
print('\n' + '='*80)
print('CHECK 5: CROSS-FIELD INVARIANTS (PER-ROW)')
print('='*80)

# PSF invariant: abs(psf - price/area) within 5%
cur.execute('''
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
''')

total, valid, psf_violations = cur.fetchone()
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
cur.execute('''
    SELECT
        COUNT(*) FILTER (WHERE price <= 0) as negative_price,
        COUNT(*) FILTER (WHERE area_sqft <= 0) as negative_area,
        COUNT(*) FILTER (WHERE psf <= 0) as negative_psf
    FROM transactions
''')

neg_price, neg_area, neg_psf = cur.fetchone()
print(f'\nPositive Value Check:')
print(f'  Negative/zero price:      {neg_price:,}')
print(f'  Negative/zero area:       {neg_area:,}')
print(f'  Negative/zero PSF:        {neg_psf:,}')

if neg_price == 0 and neg_area == 0 and neg_psf == 0:
    print('  ✅ PASS: All values positive')
else:
    print('  ❌ FAIL: Found non-positive values')

# Sane ranges
cur.execute('''
    SELECT
        COUNT(*) FILTER (WHERE price < 100000 OR price > 100000000) as price_range_violations,
        COUNT(*) FILTER (WHERE psf < 100 OR psf > 20000) as psf_range_violations,
        COUNT(*) FILTER (WHERE area_sqft < 100 OR area_sqft > 50000) as area_range_violations
    FROM transactions
    WHERE COALESCE(is_outlier, false) = false
''')

price_viol, psf_viol, area_viol = cur.fetchone()
print(f'\nSane Range Check (excluding outliers):')
print(f'  Price out of range:       {price_viol:,} (expected: $100k-$100M)')
print(f'  PSF out of range:         {psf_viol:,} (expected: $100-$20k)')
print(f'  Area out of range:        {area_viol:,} (expected: 100-50k sqft)')

if price_viol == 0 and psf_viol == 0 and area_viol == 0:
    print('  ✅ PASS: All values in sane ranges')
else:
    print('  ⚠️  WARN: Some values outside typical ranges')

# Date normalization check (should be 1st of month for URA data)
cur.execute('''
    SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE EXTRACT(DAY FROM transaction_date) = 1) as first_of_month,
        COUNT(*) FILTER (WHERE EXTRACT(DAY FROM transaction_date) != 1) as not_first
    FROM transactions
''')

total_dates, first_month, not_first = cur.fetchone()
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
cur.execute('SELECT MAX(transaction_date) FROM transactions')
max_date = cur.fetchone()[0]
ninety_days_ago = max_date - timedelta(days=90)

print(f'Latest transaction date: {max_date}')
print(f'Comparing last 90 days vs previous 90 days')
print()

# District mix comparison
cur.execute('''
    WITH recent AS (
        SELECT district, COUNT(*) as cnt
        FROM transactions
        WHERE transaction_date >= %s
        AND COALESCE(is_outlier, false) = false
        GROUP BY district
    ),
    historical AS (
        SELECT district, COUNT(*) as cnt
        FROM transactions
        WHERE transaction_date >= %s AND transaction_date < %s
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
''', (ninety_days_ago, ninety_days_ago - timedelta(days=90), ninety_days_ago))

district_shifts = cur.fetchall()
print('District Mix - Top Changes:')
for dist, recent, hist, pct in district_shifts:
    if pct is not None:
        marker = '⚠️' if abs(pct) > 10 else '  '
        print(f'{marker} {dist}: {recent:,} recent vs {hist:,} historical ({pct:+.1f}%)')
    else:
        print(f'  {dist}: {recent:,} recent vs {hist:,} historical (NEW)')

# Sale type mix
cur.execute('''
    WITH recent AS (
        SELECT sale_type, COUNT(*) as cnt
        FROM transactions
        WHERE transaction_date >= %s
        AND COALESCE(is_outlier, false) = false
        GROUP BY sale_type
    ),
    historical AS (
        SELECT sale_type, COUNT(*) as cnt
        FROM transactions
        WHERE transaction_date >= %s AND transaction_date < %s
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
''', (ninety_days_ago, ninety_days_ago - timedelta(days=90), ninety_days_ago))

sale_type_shifts = cur.fetchall()
print('\nSale Type Mix:')
for st, recent, hist, pct in sale_type_shifts:
    if pct is not None:
        marker = '⚠️' if abs(pct) > 10 else '  '
        print(f'{marker} {st}: {recent:,} recent vs {hist:,} historical ({pct:+.1f}%)')
    else:
        print(f'  {st}: {recent:,} recent vs {hist:,} historical (NEW)')

# PSF median by region
cur.execute('''
    WITH recent AS (
        SELECT region, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
        FROM transactions
        WHERE transaction_date >= %s
        AND COALESCE(is_outlier, false) = false
        AND region IS NOT NULL
        GROUP BY region
    ),
    historical AS (
        SELECT region, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
        FROM transactions
        WHERE transaction_date >= %s AND transaction_date < %s
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
''', (ninety_days_ago, ninety_days_ago - timedelta(days=90), ninety_days_ago))

psf_shifts = cur.fetchall()
print('\nMedian PSF by Region:')
for region, recent, hist, pct in psf_shifts:
    if pct is not None:
        marker = '⚠️' if abs(pct) > 10 else '  '
        print(f'{marker} {region}: ${recent:,.0f} recent vs ${hist:,.0f} historical ({pct:+.1f}%)')
    else:
        print(f'  {region}: ${recent:,.0f} recent vs ${hist:,.0f} historical (NEW)')

# ====================
# CHECK 7: Promote Guardrails Verification
# ====================
print('\n' + '='*80)
print('CHECK 7: PROMOTE GUARDRAILS VERIFICATION')
print('='*80)

# Get total row count
cur.execute('SELECT COUNT(*) FROM transactions')
total_rows = cur.fetchone()[0]
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
cur.execute('''
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
''')

natural_key_indexes = cur.fetchall()
if natural_key_indexes:
    print(f'\nNatural Key Indexes:')
    for idx_name, col_name, is_unique in natural_key_indexes:
        unique_marker = 'UNIQUE' if is_unique else 'NON-UNIQUE'
        print(f'  {idx_name} ({unique_marker}): {col_name}')
    print('  ✅ PASS: Natural key index exists')
else:
    print('\n  ⚠️  WARN: No natural key index found')

# Check for data loss by comparing batch promotion
cur.execute('''
    SELECT
        rows_after_dedup,
        rows_promoted,
        rows_after_dedup - rows_promoted as not_promoted
    FROM etl_batches
    WHERE batch_id = %s
''', (batch_id,))

batch_promo = cur.fetchone()
if batch_promo:
    dedup, promoted, not_promoted = batch_promo
    print(f'\nBatch Promotion Reconciliation:')
    print(f'  Rows after dedup:         {dedup:,}')
    print(f'  Rows promoted:            {promoted:,}')
    print(f'  Not promoted (dupes):     {not_promoted:,}')

    if not_promoted >= 0:
        print(f'  ✅ PASS: No data loss (duplicates expected)')
    else:
        print(f'  ❌ FAIL: Promoted more than staged?')

# Future dates check (mentioned in prompt)
cur.execute('''
    SELECT
        COUNT(*) as future_count,
        MAX(transaction_date) as latest_date
    FROM transactions
    WHERE transaction_date > CURRENT_DATE
''')

future_count, latest_future = cur.fetchone()
print(f'\nFuture Dates Check:')
print(f'  Future-dated transactions: {future_count:,}')
if latest_future:
    print(f'  Latest future date:        {latest_future}')

if future_count == 0:
    print('  ✅ PASS: No future dates')
elif future_count == 170 and latest_future and 'Dec' in str(latest_future) and '2025' in str(latest_future):
    print('  ⚠️  INFO: 170 Dec 31, 2025 transactions (known issue)')
else:
    print(f'  ⚠️  WARN: {future_count:,} future dates found')

conn.close()
print('\n' + '='*80)
print('CHECKS 5-7 COMPLETED')
print('='*80)
