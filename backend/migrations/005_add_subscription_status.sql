-- Migration: Add subscription_status column to users table
-- Stores Stripe subscription status for proper access control

ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50);

-- Comment for documentation
COMMENT ON COLUMN users.subscription_status IS 'Stripe subscription status: active, trialing, past_due, canceled, unpaid, incomplete, incomplete_expired';
