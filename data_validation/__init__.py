"""
Data Validation Module for Singapore Condo Dashboard

This module provides comprehensive filter state validation to ensure
data completeness and accuracy across all dashboard filter combinations.

Components:
- filter_state_tester.py: Core validation framework
- validate_api_endpoints.py: API endpoint validation
- filter_checks.sql: SQL validation query templates

Usage:
    from data_validation.filter_state_tester import FilterStateValidator, FilterState
    from data_validation.validate_api_endpoints import APIValidator

    # Database validation
    with FilterStateValidator() as validator:
        results = validator.run_all_checks(FilterState(year=2024, quarter=3))
        print(validator.generate_report(results))

    # API validation
    with APIValidator("http://localhost:5000") as api_validator:
        results = api_validator.run_full_validation()
        print(api_validator.generate_report(results))
"""

from .filter_state_tester import (
    FilterState,
    ValidationResult,
    FilterStateValidator,
    get_market_segment,
    CCR_DISTRICTS,
    RCR_DISTRICTS,
)

from .validate_api_endpoints import (
    APIValidationResult,
    APIValidator,
)

__all__ = [
    # Core classes
    "FilterState",
    "ValidationResult",
    "FilterStateValidator",
    "APIValidationResult",
    "APIValidator",
    # Utilities
    "get_market_segment",
    # Constants
    "CCR_DISTRICTS",
    "RCR_DISTRICTS",
]

__version__ = "1.0.0"
