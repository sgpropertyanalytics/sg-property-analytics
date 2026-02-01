-- =============================================================================
-- Diagnostic: Identify which hash fields cause the 12% mismatch gap
-- =============================================================================
--
-- Context: Hash v2 (5 fields) had 91.5% coverage. Hash v4 (8 fields, adding
-- property_type, district, sale_type) dropped to 79.2%. This script identifies
-- which of the 3 extra fields cause mismatches.
--
-- Run against prod DB:
--   psql "$DATABASE_URL" -f scripts/diagnose_hash_mismatch.sql
-- =============================================================================

-- 1. Field-level mismatch analysis
-- For rows that match on the original 5 fields but differ on the new 3 fields,
-- which field(s) are causing the mismatch?
WITH overlap AS (
    SELECT
        c.id as csv_id,
        a.id as api_id,
        c.project_name,
        c.transaction_month,
        c.price,
        -- Compare the 3 extra fields
        c.property_type as csv_property_type,
        a.property_type as api_property_type,
        c.district as csv_district,
        a.district as api_district,
        c.sale_type as csv_sale_type,
        a.sale_type as api_sale_type
    FROM transactions c
    JOIN transactions a
        ON c.project_name = a.project_name
        AND c.transaction_month = a.transaction_month
        AND c.price = a.price
        AND ROUND(c.area_sqft) = ROUND(a.area_sqft)
    WHERE c.source = 'csv'
      AND a.source = 'ura_api'
      AND COALESCE(c.is_outlier, false) = false
      AND COALESCE(a.is_outlier, false) = false
      AND c.property_type IN ('Condominium', 'Apartment')
      AND a.property_type IN ('Condominium', 'Apartment')
)
SELECT
    'property_type mismatch' as field,
    COUNT(*) FILTER (WHERE csv_property_type != api_property_type) as mismatch_count,
    COUNT(*) as total_matched,
    ROUND(100.0 * COUNT(*) FILTER (WHERE csv_property_type != api_property_type) / NULLIF(COUNT(*), 0), 2) as mismatch_pct
FROM overlap
UNION ALL
SELECT
    'district mismatch',
    COUNT(*) FILTER (WHERE csv_district != api_district),
    COUNT(*),
    ROUND(100.0 * COUNT(*) FILTER (WHERE csv_district != api_district) / NULLIF(COUNT(*), 0), 2)
FROM overlap
UNION ALL
SELECT
    'sale_type mismatch',
    COUNT(*) FILTER (WHERE csv_sale_type != api_sale_type),
    COUNT(*),
    ROUND(100.0 * COUNT(*) FILTER (WHERE csv_sale_type != api_sale_type) / NULLIF(COUNT(*), 0), 2)
FROM overlap
ORDER BY mismatch_count DESC;

-- 2. Sample mismatched rows (property_type)
SELECT
    c.project_name,
    c.transaction_month,
    c.price,
    c.property_type as csv_property_type,
    a.property_type as api_property_type
FROM transactions c
JOIN transactions a
    ON c.project_name = a.project_name
    AND c.transaction_month = a.transaction_month
    AND c.price = a.price
    AND ROUND(c.area_sqft) = ROUND(a.area_sqft)
WHERE c.source = 'csv'
  AND a.source = 'ura_api'
  AND COALESCE(c.is_outlier, false) = false
  AND COALESCE(a.is_outlier, false) = false
  AND c.property_type != a.property_type
LIMIT 10;

-- 3. Sample mismatched rows (district)
SELECT
    c.project_name,
    c.transaction_month,
    c.price,
    c.district as csv_district,
    a.district as api_district
FROM transactions c
JOIN transactions a
    ON c.project_name = a.project_name
    AND c.transaction_month = a.transaction_month
    AND c.price = a.price
    AND ROUND(c.area_sqft) = ROUND(a.area_sqft)
WHERE c.source = 'csv'
  AND a.source = 'ura_api'
  AND COALESCE(c.is_outlier, false) = false
  AND COALESCE(a.is_outlier, false) = false
  AND c.district != a.district
LIMIT 10;

-- 4. Sample mismatched rows (sale_type)
SELECT
    c.project_name,
    c.transaction_month,
    c.price,
    c.sale_type as csv_sale_type,
    a.sale_type as api_sale_type
FROM transactions c
JOIN transactions a
    ON c.project_name = a.project_name
    AND c.transaction_month = a.transaction_month
    AND c.price = a.price
    AND ROUND(c.area_sqft) = ROUND(a.area_sqft)
WHERE c.source = 'csv'
  AND a.source = 'ura_api'
  AND COALESCE(c.is_outlier, false) = false
  AND COALESCE(a.is_outlier, false) = false
  AND c.sale_type != a.sale_type
LIMIT 10;

-- 5. Directionality: missing_in_current vs missing_in_baseline
-- How many rows exist only in CSV vs only in API?
WITH csv_hashes AS (
    SELECT DISTINCT row_hash
    FROM transactions
    WHERE source = 'csv'
      AND row_hash IS NOT NULL
      AND COALESCE(is_outlier, false) = false
      AND property_type IN ('Condominium', 'Apartment')
),
api_hashes AS (
    SELECT DISTINCT row_hash
    FROM transactions
    WHERE source = 'ura_api'
      AND row_hash IS NOT NULL
      AND COALESCE(is_outlier, false) = false
      AND property_type IN ('Condominium', 'Apartment')
)
SELECT
    (SELECT COUNT(*) FROM csv_hashes c LEFT JOIN api_hashes a ON c.row_hash = a.row_hash WHERE a.row_hash IS NULL) as csv_only,
    (SELECT COUNT(*) FROM api_hashes a LEFT JOIN csv_hashes c ON a.row_hash = c.row_hash WHERE c.row_hash IS NULL) as api_only,
    (SELECT COUNT(*) FROM csv_hashes c JOIN api_hashes a ON c.row_hash = a.row_hash) as matched,
    (SELECT COUNT(*) FROM csv_hashes) as total_csv,
    (SELECT COUNT(*) FROM api_hashes) as total_api;
