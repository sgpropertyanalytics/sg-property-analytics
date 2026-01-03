"""
Feature flags for Pydantic migration.

Migration Status: PHASE 5 COMPLETE - Parallel Mode Disabled (Jan 2026)
- 136 cache key parity tests passing
- All 10 Pydantic models verified identical to normalize_params()
- Zero PYDANTIC_DIFF warnings in production
- Parallel mode disabled to reduce overhead

These flags enable gradual rollout of Pydantic validation:
- USE_PYDANTIC_VALIDATION: Use Pydantic results instead of old normalize_params
- PYDANTIC_PARALLEL_MODE: Run both old and new validation, log differences (now off)

Usage:
    # Disable Pydantic (rollback to old behavior)
    export USE_PYDANTIC_VALIDATION=false

    # Re-enable parallel logging if debugging needed
    export PYDANTIC_PARALLEL_MODE=true
"""
import os

# When True, use Pydantic model results instead of old normalize_params
# Default: true (as of Jan 2026 - 136 parity tests passing)
USE_PYDANTIC_VALIDATION = os.getenv("USE_PYDANTIC_VALIDATION", "true").lower() == "true"

# When True, run both validations and log any differences
# Default: false (as of Jan 2026 - zero diffs in production, parallel overhead removed)
PYDANTIC_PARALLEL_MODE = os.getenv("PYDANTIC_PARALLEL_MODE", "false").lower() == "true"
