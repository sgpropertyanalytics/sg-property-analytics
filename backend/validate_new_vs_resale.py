#!/usr/bin/env python3
"""
Data Validation Script for New vs Resale Chart
Tests data integrity, filter application, and SQL correctness
"""

from app import create_app
from models.database import db
from sqlalchemy import text
from db.sql import OUTLIER_FILTER
from constants import SALE_TYPE_NEW, SALE_TYPE_RESALE

def main():
    app = create_app()

    with app.app_context():
        # Test 1: Verify outlier filter is applied
        print('='*80)
        print('TEST 1: OUTLIER FILTER APPLICATION')
        print('='*80)
        result = db.session.execute(text(f'''
            SELECT
                COUNT(*) FILTER (WHERE COALESCE(is_outlier, false) = false) as non_outliers,
                COUNT(*) FILTER (WHERE is_outlier = true) as outliers,
                COUNT(*) as total
            FROM transactions
        ''')).fetchone()
        print(f'Total transactions: {result.total:,}')
        print(f'Non-outliers: {result.non_outliers:,}')
        print(f'Outliers excluded: {result.outliers:,}')
        print(f'Outlier rate: {result.outliers / result.total * 100:.2f}%')
        print()

        # Test 2: Check property age calculation (4-9 years in backend vs 4-8 years in UI label)
        print('='*80)
        print('TEST 2: PROPERTY AGE RANGE - BACKEND vs UI LABEL MISMATCH')
        print('='*80)
        result = db.session.execute(text(f'''
            SELECT
                MIN(EXTRACT(YEAR FROM transaction_date) - lease_start_year) as min_age,
                MAX(EXTRACT(YEAR FROM transaction_date) - lease_start_year) as max_age,
                COUNT(*) as count
            FROM transactions
            WHERE sale_type = '{SALE_TYPE_RESALE}'
              AND {OUTLIER_FILTER}
              AND lease_start_year IS NOT NULL
              AND (EXTRACT(YEAR FROM transaction_date) - lease_start_year) BETWEEN 4 AND 9
        ''')).fetchone()
        print(f'Backend SQL age range: 4-9 years (BETWEEN 4 AND 9)')
        print(f'UI Label says: "Recently TOP (4-8 yrs)"')
        print(f'Actual data age range: {int(result.min_age)} to {int(result.max_age)} years')
        print(f'Matching transactions: {result.count:,}')
        print()
        print('⚠️  CRITICAL MISMATCH: Backend uses 4-9 years, UI label says 4-8 years!')
        print()

        # Test 3: Check projects with resale filter
        print('='*80)
        print('TEST 3: PROJECTS WITH RESALE FILTER')
        print('='*80)
        result = db.session.execute(text(f'''
            WITH projects_with_resale AS (
                SELECT DISTINCT project_name
                FROM transactions
                WHERE sale_type = '{SALE_TYPE_RESALE}'
                  AND {OUTLIER_FILTER}
            )
            SELECT
                COUNT(DISTINCT t.project_name) FILTER (WHERE t.project_name IN (SELECT project_name FROM projects_with_resale)) as with_resale,
                COUNT(DISTINCT t.project_name) FILTER (WHERE t.project_name NOT IN (SELECT project_name FROM projects_with_resale)) as without_resale
            FROM transactions t
            WHERE sale_type = '{SALE_TYPE_NEW}'
              AND {OUTLIER_FILTER}
        ''')).fetchone()
        print(f'New Sale projects with resales: {result.with_resale:,}')
        print(f'New Sale projects without resales: {result.without_resale:,}')
        print()

        # Test 4: Check median vs avg price calculation
        print('='*80)
        print('TEST 4: MEDIAN vs AVG CALCULATION (Backend uses AVG as approximation)')
        print('='*80)
        result = db.session.execute(text(f'''
            WITH sample_period AS (
                SELECT DATE_TRUNC('quarter', transaction_date) as period
                FROM transactions
                WHERE {OUTLIER_FILTER}
                  AND sale_type = '{SALE_TYPE_NEW}'
                ORDER BY transaction_date DESC
                LIMIT 1
            )
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as true_median,
                AVG(price) as avg_price,
                COUNT(*) as sample_size
            FROM transactions
            WHERE {OUTLIER_FILTER}
              AND sale_type = '{SALE_TYPE_NEW}'
              AND DATE_TRUNC('quarter', transaction_date) = (SELECT period FROM sample_period)
        ''')).fetchone()
        print(f'True median: ${result.true_median:,.0f}')
        print(f'Backend AVG (approximation): ${result.avg_price:,.0f}')
        print(f'Difference: ${abs(result.true_median - result.avg_price):,.0f}')
        print(f'Sample size: {result.sample_size:,}')
        print()
        print('⚠️  Backend uses AVG instead of PERCENTILE_CONT for median!')
        print()

        # Test 5: Check NULL lease_start_year handling
        print('='*80)
        print('TEST 5: NULL LEASE_START_YEAR EXCLUSION')
        print('='*80)
        result = db.session.execute(text(f'''
            SELECT
                COUNT(*) FILTER (WHERE lease_start_year IS NULL) as null_lease,
                COUNT(*) FILTER (WHERE lease_start_year IS NOT NULL) as has_lease,
                COUNT(*) as total
            FROM transactions
            WHERE sale_type = '{SALE_TYPE_RESALE}'
              AND {OUTLIER_FILTER}
        ''')).fetchone()
        print(f'Resale with NULL lease_start_year: {result.null_lease:,}')
        print(f'Resale with valid lease_start_year: {result.has_lease:,}')
        print(f'NULL rate: {result.null_lease / result.total * 100:.2f}%')
        print(f'Backend SQL excludes NULL via: AND lease_start_year IS NOT NULL')
        print()

        # Test 6: Check age distribution in young resale bucket
        print('='*80)
        print('TEST 6: AGE DISTRIBUTION IN YOUNG RESALE BUCKET')
        print('='*80)
        result = db.session.execute(text(f'''
            SELECT
                EXTRACT(YEAR FROM transaction_date) - lease_start_year as age,
                COUNT(*) as count
            FROM transactions
            WHERE sale_type = '{SALE_TYPE_RESALE}'
              AND {OUTLIER_FILTER}
              AND lease_start_year IS NOT NULL
              AND (EXTRACT(YEAR FROM transaction_date) - lease_start_year) BETWEEN 4 AND 9
            GROUP BY age
            ORDER BY age
        ''')).fetchall()
        print('Age distribution:')
        for row in result:
            age = int(row.age)
            count = row.count
            bar = '#' * int(count / 100)
            print(f'  {age} years: {count:,} transactions {bar}')
        print()

        # Test 7: Sample data from latest quarter
        print('='*80)
        print('TEST 7: SAMPLE DATA FROM LATEST QUARTER')
        print('='*80)
        result = db.session.execute(text(f'''
            WITH latest_quarter AS (
                SELECT DATE_TRUNC('quarter', MAX(transaction_date)) as period
                FROM transactions
                WHERE {OUTLIER_FILTER}
            )
            SELECT
                'New Sale' as category,
                COUNT(*) as count,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as median_price,
                AVG(price) as avg_price
            FROM transactions
            WHERE {OUTLIER_FILTER}
              AND sale_type = '{SALE_TYPE_NEW}'
              AND DATE_TRUNC('quarter', transaction_date) = (SELECT period FROM latest_quarter)
            UNION ALL
            SELECT
                'Young Resale (4-9yr)' as category,
                COUNT(*) as count,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as median_price,
                AVG(price) as avg_price
            FROM transactions
            WHERE {OUTLIER_FILTER}
              AND sale_type = '{SALE_TYPE_RESALE}'
              AND lease_start_year IS NOT NULL
              AND (EXTRACT(YEAR FROM transaction_date) - lease_start_year) BETWEEN 4 AND 9
              AND DATE_TRUNC('quarter', transaction_date) = (SELECT period FROM latest_quarter)
        ''')).fetchall()

        for row in result:
            print(f'{row.category}:')
            print(f'  Count: {row.count:,}')
            print(f'  True Median: ${row.median_price:,.0f}')
            print(f'  AVG (backend): ${row.avg_price:,.0f}')
            print(f'  Difference: ${abs(row.median_price - row.avg_price):,.0f}')
            print()

        print('='*80)
        print('VALIDATION COMPLETE')
        print('='*80)

if __name__ == '__main__':
    main()
