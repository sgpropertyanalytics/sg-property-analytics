Validate data completeness for a specific filter state.

Arguments: $ARGUMENTS (e.g., "year=2024 quarter=3 district=D09")

## Steps

1. **Parse the filter state from arguments**
   Parse the provided arguments into individual filters:
   - `year=YYYY` - Filter by year
   - `quarter=N` - Filter by quarter (1-4)
   - `month=N` - Filter by month (1-12)
   - `district=DXX` - Filter by district (e.g., D09, D10)
   - `bedroom=N` - Filter by bedroom count (2, 3, 4)
   - `segment=XXX` - Filter by market segment (CCR, RCR, OCR)

2. **Run validation checks against the database**
   Connect to the database and run these checks:

   a) **TIME COMPLETENESS**: Are all expected months/quarters present?
   ```sql
   SELECT DISTINCT EXTRACT(MONTH FROM transaction_date)::int AS month
   FROM transactions
   WHERE EXTRACT(YEAR FROM transaction_date) = <year>
   AND (<district_filter> IS NULL OR district = <district_filter>)
   ORDER BY month;
   ```

   b) **DRILLDOWN MATH**: Does quarterly sum = yearly total?
   ```sql
   WITH yearly AS (
       SELECT COUNT(*) AS cnt, SUM(price) AS total
       FROM transactions
       WHERE EXTRACT(YEAR FROM transaction_date) = <year>
   ),
   quarterly AS (
       SELECT EXTRACT(QUARTER FROM transaction_date) AS q,
              COUNT(*) AS cnt, SUM(price) AS total
       FROM transactions
       WHERE EXTRACT(YEAR FROM transaction_date) = <year>
       GROUP BY EXTRACT(QUARTER FROM transaction_date)
   )
   SELECT y.cnt AS year_count, SUM(q.cnt) AS sum_quarter_count,
          y.total AS year_total, SUM(q.total) AS sum_quarter_total
   FROM yearly y, quarterly q
   GROUP BY y.cnt, y.total;
   ```

   c) **CROSS-DIMENSIONAL**: Does every district have every bedroom type?
   ```sql
   WITH expected AS (
       SELECT DISTINCT d.district, b.bedroom_count
       FROM (SELECT DISTINCT district FROM transactions) d
       CROSS JOIN (SELECT DISTINCT bedroom_count FROM transactions WHERE bedroom_count IN (2,3,4)) b
   ),
   actual AS (
       SELECT DISTINCT district, bedroom_count
       FROM transactions
       WHERE EXTRACT(YEAR FROM transaction_date) = <year>
   )
   SELECT e.district, e.bedroom_count, 'MISSING' AS status
   FROM expected e
   LEFT JOIN actual a ON e.district = a.district AND e.bedroom_count = a.bedroom_count
   WHERE a.district IS NULL;
   ```

   d) **FILTER ISOLATION**: Is there any data leaking from outside the filter?
   Verify the API returns ONLY data matching the filter criteria.

3. **For any failures, show:**
   - The exact SQL that reveals the issue
   - What records are missing or extra
   - The likely root cause (missing data vs. bad query logic)

4. **Output a summary table:**

   | Check | Status | Expected | Actual | Gap |
   |-------|--------|----------|--------|-----|
   | Q3 Months | PASS/FAIL | [7,8,9] | [7,9] | Missing: 8 |
   | Quarter Drilldown | PASS/FAIL | 1000 | 1000 | None |
   | District Completeness | PASS/FAIL | All combos | 95% | Missing: D15+4BR |
   | Value Consistency | PASS/FAIL | $X | $X | None |

## Example Usage

```
/validate-filters year=2024 quarter=3 district=D09
```

This will:
1. Check if months 7, 8, 9 all have transactions for D09 in 2024
2. Verify Q3 transaction count = sum of July + Aug + Sept
3. Check if D09 has 2BR, 3BR, and 4BR transactions in Q3
4. Verify no data from other districts/quarters appears
5. Compare API endpoint results vs. direct database queries

## Reference Files
- SQL templates: `data_validation/filter_checks.sql`
- Python framework: `data_validation/filter_state_tester.py`
- API validator: `data_validation/validate_api_endpoints.py`
