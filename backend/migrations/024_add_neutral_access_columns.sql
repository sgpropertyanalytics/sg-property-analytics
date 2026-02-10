-- Migration 024: Non-breaking access naming cleanup (phase 1)
--
-- Goal:
-- - Introduce neutral access column names while preserving legacy columns.
-- - Backfill neutral columns from legacy data.
-- - Keep both sets in sync using a trigger during rollout.
--
-- Legacy -> Neutral mapping:
--   tier                 -> access_tier
--   subscription_status  -> access_status
--   subscription_ends_at -> access_expires_at
--   stripe_customer_id   -> billing_customer_ref
--   access_override      -> access_override_enabled
--   override_until       -> access_override_until
--   entitlement_source   -> access_source

BEGIN;

-- Ensure legacy columns exist so this migration is safe in mixed environments.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tier VARCHAR(20);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_override BOOLEAN DEFAULT FALSE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS override_until TIMESTAMPTZ;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS entitlement_source VARCHAR(50);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_tier VARCHAR(20);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_status VARCHAR(50);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS billing_customer_ref VARCHAR(255);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_override_enabled BOOLEAN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_override_until TIMESTAMPTZ;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_source VARCHAR(50);

ALTER TABLE users
    ALTER COLUMN access_tier SET DEFAULT 'free';

ALTER TABLE users
    ALTER COLUMN access_override_enabled SET DEFAULT FALSE;

-- One-time backfill from legacy columns.
UPDATE users
SET
    access_tier = COALESCE(access_tier, tier),
    access_status = COALESCE(access_status, subscription_status),
    access_expires_at = COALESCE(access_expires_at, subscription_ends_at),
    billing_customer_ref = COALESCE(billing_customer_ref, stripe_customer_id),
    access_override_enabled = COALESCE(access_override_enabled, access_override),
    access_override_until = COALESCE(access_override_until, override_until),
    access_source = COALESCE(access_source, entitlement_source);

-- Keep legacy and neutral fields synchronized during phased deploy.
CREATE OR REPLACE FUNCTION sync_users_access_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- access_tier <-> tier
    NEW.tier := COALESCE(NEW.access_tier, NEW.tier, 'free');
    NEW.access_tier := COALESCE(NEW.access_tier, NEW.tier, 'free');

    -- access_status <-> subscription_status
    NEW.subscription_status := COALESCE(NEW.access_status, NEW.subscription_status);
    NEW.access_status := COALESCE(NEW.access_status, NEW.subscription_status);

    -- access_expires_at <-> subscription_ends_at
    NEW.subscription_ends_at := COALESCE(NEW.access_expires_at, NEW.subscription_ends_at);
    NEW.access_expires_at := COALESCE(NEW.access_expires_at, NEW.subscription_ends_at);

    -- billing_customer_ref <-> stripe_customer_id
    NEW.stripe_customer_id := COALESCE(NEW.billing_customer_ref, NEW.stripe_customer_id);
    NEW.billing_customer_ref := COALESCE(NEW.billing_customer_ref, NEW.stripe_customer_id);

    -- access_override_enabled <-> access_override
    NEW.access_override := COALESCE(NEW.access_override_enabled, NEW.access_override, FALSE);
    NEW.access_override_enabled := COALESCE(NEW.access_override_enabled, NEW.access_override, FALSE);

    -- access_override_until <-> override_until
    NEW.override_until := COALESCE(NEW.access_override_until, NEW.override_until);
    NEW.access_override_until := COALESCE(NEW.access_override_until, NEW.override_until);

    -- access_source <-> entitlement_source
    NEW.entitlement_source := COALESCE(NEW.access_source, NEW.entitlement_source);
    NEW.access_source := COALESCE(NEW.access_source, NEW.entitlement_source);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_users_access_columns ON users;
CREATE TRIGGER trg_sync_users_access_columns
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION sync_users_access_columns();

COMMENT ON COLUMN users.access_tier IS 'Neutral alias for legacy users.tier during migration.';
COMMENT ON COLUMN users.access_status IS 'Neutral alias for legacy users.subscription_status during migration.';
COMMENT ON COLUMN users.access_expires_at IS 'Neutral alias for legacy users.subscription_ends_at during migration.';
COMMENT ON COLUMN users.billing_customer_ref IS 'Neutral alias for legacy users.stripe_customer_id during migration.';
COMMENT ON COLUMN users.access_override_enabled IS 'Neutral alias for legacy users.access_override during migration.';
COMMENT ON COLUMN users.access_override_until IS 'Neutral alias for legacy users.override_until during migration.';
COMMENT ON COLUMN users.access_source IS 'Neutral alias for legacy users.entitlement_source during migration.';

COMMIT;
