"""
Feature flags for Pydantic migration.

Migration Status: PHASE 2 - Pydantic as Primary (Jan 2026)
- 136 cache key parity tests passing
- All 10 Pydantic models verified identical to normalize_params()
- Parallel mode kept on to log any edge cases in production traffic

These flags enable gradual rollout of Pydantic validation:
- USE_PYDANTIC_VALIDATION: Use Pydantic results instead of old normalize_params
- PYDANTIC_PARALLEL_MODE: Run both old and new validation, log differences

Usage:
    # Disable Pydantic (rollback to old behavior)
    export USE_PYDANTIC_VALIDATION=false

    # Disable parallel logging once stable (Phase 3)
    export PYDANTIC_PARALLEL_MODE=false
"""
import os

# When True, use Pydantic model results instead of old normalize_params
# Default: true (as of Jan 2026 - 136 parity tests passing)
USE_PYDANTIC_VALIDATION = os.getenv("USE_PYDANTIC_VALIDATION", "true").lower() == "true"

# When True, run both validations and log any differences
# Keep on until stable in production, then disable to reduce overhead
PYDANTIC_PARALLEL_MODE = os.getenv("PYDANTIC_PARALLEL_MODE", "true").lower() == "true"
