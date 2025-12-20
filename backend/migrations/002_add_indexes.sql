-- Migration 002: Add indexes for query performance
-- Run AFTER 001_add_all_missing_columns.sql
-- Run with: psql "$DATABASE_URL" -f backend/migrations/002_add_indexes.sql
--
-- WARNING: Index creation can lock tables. On large tables:
-- - Consider running during low-traffic periods
-- - For zero-downtime, use CREATE INDEX CONCURRENTLY (but cannot run in transaction)
--
-- This file uses regular CREATE INDEX IF NOT EXISTS for simplicity.
-- For production with large tables, consider running indexes one-by-one with CONCURRENTLY.

-- =============================================================================
-- TRANSACTIONS TABLE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_transactions_floor_level ON transactions(floor_level);
CREATE INDEX IF NOT EXISTS ix_transactions_market_segment ON transactions(market_segment);

-- =============================================================================
-- NEW_LAUNCHES TABLE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_new_launches_project_name ON new_launches(project_name);
CREATE INDEX IF NOT EXISTS ix_new_launches_developer ON new_launches(developer);
CREATE INDEX IF NOT EXISTS ix_new_launches_district ON new_launches(district);
CREATE INDEX IF NOT EXISTS ix_new_launches_planning_area ON new_launches(planning_area);
CREATE INDEX IF NOT EXISTS ix_new_launches_market_segment ON new_launches(market_segment);
CREATE INDEX IF NOT EXISTS ix_new_launches_launch_year ON new_launches(launch_year);
CREATE INDEX IF NOT EXISTS ix_new_launches_needs_review ON new_launches(needs_review);
CREATE INDEX IF NOT EXISTS ix_new_launches_segment_year ON new_launches(market_segment, launch_year);
CREATE INDEX IF NOT EXISTS ix_new_launches_district_year ON new_launches(district, launch_year);

-- =============================================================================
-- GLS_TENDERS TABLE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_gls_tenders_status ON gls_tenders(status);
CREATE INDEX IF NOT EXISTS ix_gls_tenders_market_segment ON gls_tenders(market_segment);
CREATE INDEX IF NOT EXISTS ix_gls_status_segment ON gls_tenders(status, market_segment);
CREATE INDEX IF NOT EXISTS ix_gls_release_date ON gls_tenders(release_date);

-- =============================================================================
-- PROJECT_LOCATIONS TABLE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_project_locations_project_name ON project_locations(project_name);
CREATE INDEX IF NOT EXISTS ix_project_locations_district ON project_locations(district);
CREATE INDEX IF NOT EXISTS ix_project_locations_market_segment ON project_locations(market_segment);
CREATE INDEX IF NOT EXISTS ix_project_locations_planning_area ON project_locations(planning_area);
CREATE INDEX IF NOT EXISTS ix_project_locations_geocode_status ON project_locations(geocode_status);
CREATE INDEX IF NOT EXISTS ix_project_locations_has_popular_school_1km ON project_locations(has_popular_school_1km);
CREATE INDEX IF NOT EXISTS ix_project_locations_segment_school ON project_locations(market_segment, has_popular_school_1km);
CREATE INDEX IF NOT EXISTS ix_project_locations_district_school ON project_locations(district, has_popular_school_1km);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT 'Indexes created successfully' AS status;

-- Show index count per table
SELECT
    tablename,
    COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('transactions', 'new_launches', 'gls_tenders', 'project_locations')
GROUP BY tablename
ORDER BY tablename;
