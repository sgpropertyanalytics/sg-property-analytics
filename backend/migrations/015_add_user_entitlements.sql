-- Migration 015: Add user entitlement override fields and normalize tiers

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_override BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS override_until TIMESTAMPTZ;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS entitlement_source VARCHAR(50);

-- Migrate legacy enterprise users to premium + override
UPDATE users
SET
    tier = 'premium',
    access_override = TRUE,
    override_until = NULL,
    entitlement_source = 'admin'
WHERE tier = 'enterprise';

COMMIT;
