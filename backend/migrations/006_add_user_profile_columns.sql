-- Migration 006: Add user profile columns for Google OAuth
-- This migration is IDEMPOTENT - safe to run multiple times
-- Run with: psql "$DATABASE_URL" -f backend/migrations/006_add_user_profile_columns.sql
--
-- Created: 2024-12
-- Models affected: users

-- =============================================================================
-- USERS TABLE
-- Add profile columns for Google OAuth (displayName, photoURL)
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    missing_cols TEXT := '';
BEGIN
    -- Check profile columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='display_name') THEN
        missing_cols := missing_cols || 'users.display_name, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avatar_url') THEN
        missing_cols := missing_cols || 'users.avatar_url, ';
    END IF;

    IF missing_cols != '' THEN
        RAISE WARNING 'Migration may have failed. Missing: %', missing_cols;
    ELSE
        RAISE NOTICE 'Migration 006 successful: user profile columns added';
    END IF;
END $$;
