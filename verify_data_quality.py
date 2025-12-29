#!/usr/bin/env python3
"""
Comprehensive Data Quality Verification
Batch ID: 186325f7-1171-4a11-afef-a66355ce36ca
"""

import os
import sys
sys.path.insert(0, 'backend')

from config import get_db_connection
from datetime import datetime

batch_id = '186325f7-1171-4a11-afef-a66355ce36ca'

print('='*80)
print('DATA QUALITY VERIFICATION REPORT')
print(f'Batch ID: {batch_id}')
print(f'Timestamp: {datetime.now().isoformat()}')
print('='*80)

conn = get_db_connection()
cur = conn.cursor()

# ====================
# CHECK 1: Source Completeness Reconciliation
# ====================
print('\n' + '='*80)
print('CHECK 1: SOURCE COMPLETENESS RECONCILIATION')
print('='*80)

cur.execute('''
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
    WHERE batch_id = %s
''', (batch_id,))

batch = cur.fetchone()
if batch:
    source_rows, loaded, rejected, skipped = batch[1], batch[2], batch[3], batch[4]
    after_dedup, promoted = batch[5], batch[6]

    print(f'Source Row Count:    {source_rows:,}')
    print(f'Rows Loaded:         {loaded:,}')
    print(f'Rows Rejected:       {rejected:,}')
    print(f'Rows Skipped:        {skipped:,}')
    print(f'After Dedup:         {after_dedup:,}')
    print(f'Rows Promoted:       {promoted:,}')
    print()

    # Calculate reconciliation
    accounted = (loaded or 0) + (rejected or 0) + (skipped or 0)
    unaccounted = (source_rows or 0) - accounted

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

cur.execute('''
    SELECT
        batch_id,
        COUNT(*) as row_count,
        MIN(created_at) as first_row,
        MAX(created_at) as last_row
    FROM transactions_staging
    GROUP BY batch_id
    ORDER BY MAX(created_at) DESC
''')

staging_batches = cur.fetchall()
print(f'Distinct batches in staging: {len(staging_batches)}')
print()

if len(staging_batches) > 0:
    for i, (bid, count, first, last) in enumerate(staging_batches):
        is_current = bid == batch_id
        marker = '→ CURRENT' if is_current else '  STALE'
        print(f'{marker} {bid}: {count:,} rows (created {first} to {last})')

if len(staging_batches) == 1 and staging_batches[0][0] == batch_id:
    print('\n✅ PASS: Only current batch in staging')
elif len(staging_batches) == 0:
    print('\n⚠️  WARN: Staging table is empty')
else:
    print(f'\n❌ FAIL: {len(staging_batches)} batches in staging (should be 1)')

# ====================
# CHECK 3: Natural Key Uniqueness in Production
# ====================
print('\n' + '='*80)
print('CHECK 3: NATURAL KEY UNIQUENESS IN PRODUCTION')
print('='*80)

# Check for duplicates using natural key
cur.execute('''
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
''')

duplicates = cur.fetchall()
if duplicates:
    print(f'❌ FAIL: Found {len(duplicates)} natural key duplicates')
    print('\nTop 10 duplicates:')
    for dup in duplicates:
        print(f'  {dup[0][:30]:30s} | {dup[1]} | ${dup[2]:,} | {dup[3]:,} sqft | floor={dup[4]:10s} | count={dup[5]}')
else:
    print('✅ PASS: No natural key duplicates found')

# Check for index existence
cur.execute('''
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'transactions'
    AND indexdef LIKE '%project_name%'
    AND indexdef LIKE '%transaction_date%'
''')

indexes = cur.fetchall()
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
cur.execute('''
    SELECT
        COUNT(DISTINCT t.project_name) as total_projects,
        COUNT(DISTINCT pl.project_name) as projects_with_location
    FROM transactions t
    LEFT JOIN project_locations pl ON LOWER(TRIM(t.project_name)) = LOWER(TRIM(pl.project_name))
''')

proj_total, proj_with_loc = cur.fetchone()
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
cur.execute('''
    SELECT
        district,
        region,
        COUNT(*) as count
    FROM transactions
    WHERE district IS NOT NULL
    GROUP BY district, region
    ORDER BY district
''')

districts = cur.fetchall()
print(f'\nDistrict/Region Mappings: {len(districts)} unique combinations')

# Check for nulls
cur.execute('''
    SELECT
        COUNT(*) FILTER (WHERE district IS NULL) as null_district,
        COUNT(*) FILTER (WHERE region IS NULL) as null_region,
        COUNT(*) as total
    FROM transactions
''')

null_dist, null_reg, total = cur.fetchone()
print(f'  Null districts:           {null_dist:,} ({null_dist/total*100:.2f}%)')
print(f'  Null regions:             {null_reg:,} ({null_reg/total*100:.2f}%)')

if null_dist == 0 and null_reg == 0:
    print('  ✅ PASS: No null district/region values')
else:
    print('  ⚠️  WARN: Found null values')

# Sale type enum
cur.execute('''
    SELECT
        sale_type,
        COUNT(*) as count
    FROM transactions
    WHERE sale_type IS NOT NULL
    GROUP BY sale_type
    ORDER BY count DESC
''')

sale_types = cur.fetchall()
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

conn.close()
print('\n' + '='*80)
print('CHECKS 1-4 COMPLETED')
print('='*80)
