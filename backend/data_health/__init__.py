"""
Data Health Module - Project Registry and Data Quality Checks

This module provides:
1. Project name normalization and stable key generation
2. Unified project registry (merging CSV + transactions)
3. Data completeness and plausibility checks

Usage:
    from data_health import normalize_name, project_key, get_project, run_all_checks

    # Normalize a project name
    canonical = normalize_name("THE SAIL @ MARINA BAY")  # "SAIL AT MARINA BAY"

    # Get stable lookup key
    key = project_key("THE SAIL @ MARINA BAY")  # "sail-at-marina-bay"

    # Look up project
    project = get_project("sail-at-marina-bay")

    # Run data health checks
    report = run_all_checks()
"""

from data_health.core import (
    normalize_name,
    project_key,
    slugify,
    get_project,
    get_project_by_raw_name,
    upsert_project,
    get_district_coverage,
    get_all_projects,
    bulk_upsert_from_csv,
    bulk_upsert_from_transactions,
)

from data_health.checks import (
    IssueType,
    Severity,
    Issue,
    CheckResult,
    HealthReport,
    check_completeness,
    check_plausibility,
    check_coverage,
    run_all_checks,
    print_report,
)

__all__ = [
    # Core - normalization
    'normalize_name',
    'project_key',
    'slugify',
    # Core - registry operations
    'get_project',
    'get_project_by_raw_name',
    'upsert_project',
    'get_district_coverage',
    'get_all_projects',
    'bulk_upsert_from_csv',
    'bulk_upsert_from_transactions',
    # Checks - types
    'IssueType',
    'Severity',
    'Issue',
    'CheckResult',
    'HealthReport',
    # Checks - functions
    'check_completeness',
    'check_plausibility',
    'check_coverage',
    'run_all_checks',
    'print_report',
]
