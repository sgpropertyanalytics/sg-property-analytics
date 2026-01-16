-- Migration: Rename new_launches table to upcoming_launches
-- Date: 2025-12-21
-- Description: Semantic clarification - "upcoming launches" = projects NOT YET LAUNCHED

-- Rename the table
ALTER TABLE IF EXISTS new_launches RENAME TO upcoming_launches;

-- Rename indexes (if they exist)
ALTER INDEX IF EXISTS ix_new_launches_segment_year RENAME TO ix_upcoming_launches_segment_year;
ALTER INDEX IF EXISTS ix_new_launches_district_year RENAME TO ix_upcoming_launches_district_year;
ALTER INDEX IF EXISTS ix_new_launches_project_name RENAME TO ix_upcoming_launches_project_name;
ALTER INDEX IF EXISTS ix_new_launches_developer RENAME TO ix_upcoming_launches_developer;
ALTER INDEX IF EXISTS ix_new_launches_district RENAME TO ix_upcoming_launches_district;
ALTER INDEX IF EXISTS ix_new_launches_planning_area RENAME TO ix_upcoming_launches_planning_area;
ALTER INDEX IF EXISTS ix_new_launches_market_segment RENAME TO ix_upcoming_launches_market_segment;
ALTER INDEX IF EXISTS ix_new_launches_launch_year RENAME TO ix_upcoming_launches_launch_year;
ALTER INDEX IF EXISTS ix_new_launches_needs_review RENAME TO ix_upcoming_launches_needs_review;

-- Add legacy fields for migration compatibility (if not exist)
ALTER TABLE upcoming_launches ADD COLUMN IF NOT EXISTS last_scraped TIMESTAMP;
ALTER TABLE upcoming_launches ADD COLUMN IF NOT EXISTS last_validated TIMESTAMP;

-- Update the foreign key relationship in gls_tenders backref (if needed)
-- This is handled by SQLAlchemy, no SQL change needed

-- Verify the rename
SELECT 'Migration 003 complete: new_launches renamed to upcoming_launches' AS status;
