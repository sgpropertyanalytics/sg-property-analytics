"""
Feature flags for Pydantic migration.

Migration Status: PHASE 7 COMPLETE (Jan 2026)
- Pydantic is now the PRIMARY validation path
- normalize_params() only used as fallback for endpoints without Pydantic models
- pydantic_comparison.py deleted (parallel mode removed)
- 136 cache key parity tests passing

Usage:
    # Disable Pydantic (rollback to old behavior for all endpoints)
    export USE_PYDANTIC_VALIDATION=false
"""
import os

# When True, use Pydantic model results instead of old normalize_params
# Default: true (as of Jan 2026 - migration complete)
USE_PYDANTIC_VALIDATION = os.getenv("USE_PYDANTIC_VALIDATION", "true").lower() == "true"
