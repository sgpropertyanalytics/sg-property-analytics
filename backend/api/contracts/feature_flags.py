"""
Feature flags for Pydantic migration.

These flags enable gradual rollout of Pydantic validation:
- PYDANTIC_PARALLEL_MODE: Run both old and new validation, log differences
- USE_PYDANTIC_VALIDATION: Use Pydantic results instead of old normalize_params

Usage:
    # Enable parallel mode (default) - logs differences but uses old result
    export PYDANTIC_PARALLEL_MODE=true

    # Enable Pydantic as primary validation
    export USE_PYDANTIC_VALIDATION=true

    # Disable parallel logging once stable
    export PYDANTIC_PARALLEL_MODE=false
"""
import os

# When True, use Pydantic model results instead of old normalize_params
USE_PYDANTIC_VALIDATION = os.getenv("USE_PYDANTIC_VALIDATION", "false").lower() == "true"

# When True, run both validations and log any differences
PYDANTIC_PARALLEL_MODE = os.getenv("PYDANTIC_PARALLEL_MODE", "true").lower() == "true"
