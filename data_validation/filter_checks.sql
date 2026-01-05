-- =====================================================
-- FILTER STATE VALIDATION QUERIES
-- Singapore Condo Resale Dashboard
-- =====================================================
-- These queries validate data completeness and consistency
-- for various filter combinations used in the dashboard.
--
-- Table: transactions
-- Key columns: transaction_date, district, bedroom_count, price, psf, sale_type
-- =====================================================

-- 1. TIME PERIOD COMPLETENESS CHECK
-- Check if all months exist for a given year filter
-- Parameters: :selected_year, :district_filter, :bedroom_filter
WITH expected_months AS (
    SELECT generate_series(1, 12) AS month_num
),
actual_months AS (
    SELECT DISTINCT EXTRACT(MONTH FROM transaction_date)::int AS month_num
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
    -- Add other active filters here
    AND (:district_filter IS NULL OR district = :district_filter)
    AND (:bedroom_filter IS NULL OR bedroom_count = :bedroom_filter)
)
SELECT
    e.month_num,
    CASE WHEN a.month_num IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status
FROM expected_months e
LEFT JOIN actual_months a ON e.month_num = a.month_num
ORDER BY e.month_num;


-- 2. QUARTERLY COMPLETENESS WITH DRILL-DOWN VALIDATION
-- Verify quarterly totals equal sum of monthly totals
-- Parameters: :selected_year, :district_filter
WITH quarterly_totals AS (
    SELECT
        EXTRACT(QUARTER FROM transaction_date)::int AS quarter,
        COUNT(*) AS txn_count,
        SUM(price) AS total_value,
        AVG(psf) AS avg_psf
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
    AND (:district_filter IS NULL OR district = :district_filter)
    GROUP BY EXTRACT(QUARTER FROM transaction_date)
),
monthly_totals AS (
    SELECT
        EXTRACT(QUARTER FROM transaction_date)::int AS quarter,
        EXTRACT(MONTH FROM transaction_date)::int AS month,
        COUNT(*) AS txn_count,
        SUM(price) AS total_value
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
    AND (:district_filter IS NULL OR district = :district_filter)
    GROUP BY EXTRACT(QUARTER FROM transaction_date), EXTRACT(MONTH FROM transaction_date)
),
monthly_rollup AS (
    SELECT
        quarter,
        SUM(txn_count) AS sum_monthly_count,
        SUM(total_value) AS sum_monthly_value
    FROM monthly_totals
    GROUP BY quarter
)
SELECT
    q.quarter,
    q.txn_count AS quarterly_count,
    m.sum_monthly_count AS sum_of_months,
    CASE WHEN q.txn_count = m.sum_monthly_count THEN 'MATCH' ELSE 'MISMATCH' END AS count_check,
    q.total_value AS quarterly_value,
    m.sum_monthly_value AS sum_of_months_value,
    CASE WHEN q.total_value = m.sum_monthly_value THEN 'MATCH' ELSE 'MISMATCH' END AS value_check
FROM quarterly_totals q
JOIN monthly_rollup m ON q.quarter = m.quarter
ORDER BY q.quarter;


-- 3. CROSS-DIMENSIONAL COMPLETENESS
-- Check every district has data for every bedroom type (for selected time period)
-- Parameters: :selected_year, :selected_quarter
WITH expected_combinations AS (
    SELECT DISTINCT
        d.district,
        b.bedroom_count
    FROM (SELECT DISTINCT district FROM transactions) d
    CROSS JOIN (SELECT DISTINCT bedroom_count FROM transactions WHERE bedroom_count IN (2, 3, 4)) b
),
actual_combinations AS (
    SELECT DISTINCT
        district,
        bedroom_count
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
    AND EXTRACT(QUARTER FROM transaction_date) = :selected_quarter
)
SELECT
    e.district,
    e.bedroom_count,
    CASE WHEN a.district IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status,
    COALESCE(
        (SELECT COUNT(*) FROM transactions t
         WHERE t.district = e.district
         AND t.bedroom_count = e.bedroom_count
         AND EXTRACT(YEAR FROM t.transaction_date) = :selected_year),
        0
    ) AS total_records_in_year
FROM expected_combinations e
LEFT JOIN actual_combinations a
    ON e.district = a.district
    AND e.bedroom_count = a.bedroom_count
WHERE a.district IS NULL  -- Only show missing
ORDER BY e.district, e.bedroom_count;


-- 4. FILTER ISOLATION CHECK (No Data Leakage)
-- Verify NO records exist outside the filter boundaries
-- This validates that the API is correctly filtering
-- Parameters: :selected_year, :selected_quarter, :selected_month

-- Check for records outside selected year
SELECT
    'Year Leakage' AS check_type,
    EXTRACT(YEAR FROM transaction_date) AS leaked_year,
    COUNT(*) AS leaked_records
FROM transactions
WHERE EXTRACT(YEAR FROM transaction_date) != :selected_year
GROUP BY EXTRACT(YEAR FROM transaction_date)
ORDER BY leaked_year;

-- Check for records outside selected quarter (within year)
SELECT
    'Quarter Leakage' AS check_type,
    EXTRACT(QUARTER FROM transaction_date) AS leaked_quarter,
    COUNT(*) AS leaked_records
FROM transactions
WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
AND EXTRACT(QUARTER FROM transaction_date) != :selected_quarter
GROUP BY EXTRACT(QUARTER FROM transaction_date)
ORDER BY leaked_quarter;


-- 5. DRILL-DOWN PARENT-CHILD CONSISTENCY
-- When user clicks on a bar in yearly chart to see quarterly breakdown
-- Parameters: :selected_year, :district_filter
WITH parent_level AS (
    SELECT
        SUM(price) AS parent_total,
        COUNT(*) AS parent_count
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
    AND (:district_filter IS NULL OR district = :district_filter)
),
child_level AS (
    SELECT
        EXTRACT(QUARTER FROM transaction_date) AS quarter,
        SUM(price) AS child_total,
        COUNT(*) AS child_count
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
    AND (:district_filter IS NULL OR district = :district_filter)
    GROUP BY EXTRACT(QUARTER FROM transaction_date)
)
SELECT
    p.parent_total,
    SUM(c.child_total) AS sum_of_children,
    p.parent_total - SUM(c.child_total) AS value_discrepancy,
    p.parent_count,
    SUM(c.child_count) AS sum_of_child_counts,
    p.parent_count - SUM(c.child_count) AS count_discrepancy
FROM parent_level p, child_level c
GROUP BY p.parent_total, p.parent_count;


-- 6. DISTRICT -> PROJECT DRILL-DOWN CONSISTENCY
-- Validate that project-level totals sum to district totals
-- Parameters: :selected_year, :district_filter
WITH district_totals AS (
    SELECT
        district,
        SUM(price) AS district_total,
        COUNT(*) AS district_count
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
    AND (:district_filter IS NULL OR district = :district_filter)
    GROUP BY district
),
project_totals AS (
    SELECT
        district,
        project_name,
        SUM(price) AS project_total,
        COUNT(*) AS project_count
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
    AND (:district_filter IS NULL OR district = :district_filter)
    GROUP BY district, project_name
),
project_rollup AS (
    SELECT
        district,
        SUM(project_total) AS sum_project_total,
        SUM(project_count) AS sum_project_count
    FROM project_totals
    GROUP BY district
)
SELECT
    d.district,
    d.district_total,
    p.sum_project_total,
    d.district_total - p.sum_project_total AS value_discrepancy,
    d.district_count,
    p.sum_project_count,
    d.district_count - p.sum_project_count AS count_discrepancy,
    CASE
        WHEN d.district_total = p.sum_project_total AND d.district_count = p.sum_project_count
        THEN 'PASS'
        ELSE 'FAIL'
    END AS validation_status
FROM district_totals d
JOIN project_rollup p ON d.district = p.district
ORDER BY d.district;


-- 7. BEDROOM TYPE COMPLETENESS PER DISTRICT
-- Check which districts are missing bedroom types in a given period
-- Parameters: :selected_year
SELECT
    district,
    COUNT(DISTINCT bedroom_count) AS bedroom_types_present,
    ARRAY_AGG(DISTINCT bedroom_count ORDER BY bedroom_count) AS bedroom_types,
    CASE
        WHEN 2 = ANY(ARRAY_AGG(DISTINCT bedroom_count)) THEN 'Y' ELSE 'N'
    END AS has_2br,
    CASE
        WHEN 3 = ANY(ARRAY_AGG(DISTINCT bedroom_count)) THEN 'Y' ELSE 'N'
    END AS has_3br,
    CASE
        WHEN 4 = ANY(ARRAY_AGG(DISTINCT bedroom_count)) THEN 'Y' ELSE 'N'
    END AS has_4br
FROM transactions
WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
AND bedroom_count IN (2, 3, 4)
GROUP BY district
ORDER BY district;


-- 8. SALE TYPE DISTRIBUTION CHECK
-- Verify sale_type (New Sale vs Resale) distribution
-- Parameters: :selected_year, :district_filter
SELECT
    sale_type,
    EXTRACT(QUARTER FROM transaction_date)::int AS quarter,
    COUNT(*) AS txn_count,
    SUM(price) AS total_value,
    AVG(psf) AS avg_psf,
    ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER (PARTITION BY EXTRACT(QUARTER FROM transaction_date)) * 100, 2) AS pct_of_quarter
FROM transactions
WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
AND (:district_filter IS NULL OR district = :district_filter)
AND sale_type IS NOT NULL
GROUP BY sale_type, EXTRACT(QUARTER FROM transaction_date)
ORDER BY quarter, sale_type;


-- 9. REGION (CCR/RCR/OCR) AGGREGATION CHECK
-- Verify region-level aggregates match sum of districts
WITH district_regions AS (
    SELECT
        district,
        CASE
            WHEN district IN ('D01', 'D02', 'D06', 'D09', 'D10', 'D11') THEN 'CCR'
            WHEN district IN ('D03', 'D04', 'D05', 'D07', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20') THEN 'RCR'
            ELSE 'OCR'
        END AS region
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = :selected_year
),
region_totals_direct AS (
    SELECT
        dr.region,
        COUNT(*) AS region_count,
        SUM(t.price) AS region_total
    FROM transactions t
    JOIN district_regions dr ON t.district = dr.district
    WHERE EXTRACT(YEAR FROM t.transaction_date) = :selected_year
    GROUP BY dr.region
),
district_totals AS (
    SELECT
        dr.region,
        t.district,
        COUNT(*) AS district_count,
        SUM(t.price) AS district_total
    FROM transactions t
    JOIN district_regions dr ON t.district = dr.district
    WHERE EXTRACT(YEAR FROM t.transaction_date) = :selected_year
    GROUP BY dr.region, t.district
),
district_rollup AS (
    SELECT
        region,
        SUM(district_count) AS sum_district_count,
        SUM(district_total) AS sum_district_total
    FROM district_totals
    GROUP BY region
)
SELECT
    r.region,
    r.region_count,
    d.sum_district_count,
    r.region_count - d.sum_district_count AS count_discrepancy,
    r.region_total,
    d.sum_district_total,
    r.region_total - d.sum_district_total AS value_discrepancy,
    CASE
        WHEN r.region_count = d.sum_district_count AND r.region_total = d.sum_district_total
        THEN 'PASS'
        ELSE 'FAIL'
    END AS validation_status
FROM region_totals_direct r
JOIN district_rollup d ON r.region = d.region
ORDER BY r.region;


-- 10. DATA FRESHNESS CHECK
-- Verify latest transaction dates per dimension
SELECT
    'Overall' AS dimension,
    NULL AS value,
    MIN(transaction_date) AS earliest_date,
    MAX(transaction_date) AS latest_date,
    COUNT(*) AS record_count
FROM transactions
UNION ALL
SELECT
    'By District' AS dimension,
    district AS value,
    MIN(transaction_date) AS earliest_date,
    MAX(transaction_date) AS latest_date,
    COUNT(*) AS record_count
FROM transactions
GROUP BY district
ORDER BY dimension, value;
