-- Migration 023: Project-key functional indexes for new-launch endpoints
--
-- Purpose:
-- - Speed up UPPER(TRIM(project_name)) joins/grouping used by:
--   - /api/new-launch-timeline
--   - /api/new-launch-absorption
-- - Reduce repeated scans for bedroom/project cohort derivation.

-- Project key + sale_type + transaction_date for launch month joins and timeline scans
CREATE INDEX IF NOT EXISTS idx_txn_active_project_key_sale_date
  ON transactions ((UPPER(TRIM(project_name))), sale_type, transaction_date)
  INCLUDE (district)
  WHERE COALESCE(is_outlier, false) = false;

-- Sale type + bedroom + project key for bedroom cohort membership filtering
CREATE INDEX IF NOT EXISTS idx_txn_active_sale_bedroom_project_key
  ON transactions (sale_type, bedroom_count, (UPPER(TRIM(project_name))))
  WHERE COALESCE(is_outlier, false) = false;

ANALYZE transactions;
