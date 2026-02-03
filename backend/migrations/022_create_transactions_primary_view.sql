-- Create a primary-source view that prefers URA API rows.
-- Row-level fallback: include CSV rows only when no matching URA row_hash exists.
-- For rows without row_hash, fall back to CSV only when URA has no data for that month.

CREATE OR REPLACE VIEW transactions_primary AS
WITH ura_months AS (
    SELECT DISTINCT transaction_month
    FROM transactions
    WHERE source = 'ura_api'
),
ura AS (
    SELECT *
    FROM transactions
    WHERE source = 'ura_api'
),
csv AS (
    SELECT *
    FROM transactions
    WHERE source IN ('csv', 'csv_offline')
)
SELECT * FROM ura
UNION ALL
SELECT c.*
FROM csv c
LEFT JOIN ura u
  ON c.row_hash IS NOT NULL
 AND u.row_hash = c.row_hash
LEFT JOIN ura_months um
  ON c.transaction_month IS NOT DISTINCT FROM um.transaction_month
WHERE
    -- If row_hash exists, only include CSV when no URA row_hash match
    (c.row_hash IS NOT NULL AND u.id IS NULL)
 OR
    -- If row_hash is NULL, include CSV only if URA has no data that month
    (c.row_hash IS NULL AND um.transaction_month IS NULL);
