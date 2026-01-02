#!/usr/bin/env python3
"""
Validate E2E mock shapes match API contracts.

This script checks that the mock responses in frontend/e2e/fixtures/api-mocks.js
contain the required fields defined in frontend/src/generated/apiContract.json.

Usage:
    python scripts/validate_e2e_mocks.py

Exit codes:
    0 - All mocks valid
    1 - Validation warnings (mocks may be stale)
"""

import json
import re
import sys
from pathlib import Path


def load_contract() -> dict:
    """Load the generated API contract."""
    contract_path = Path("frontend/src/generated/apiContract.json")
    if not contract_path.exists():
        print(f"Error: Contract file not found: {contract_path}")
        print("Run: python backend/scripts/generate_contracts.py")
        sys.exit(1)

    with open(contract_path) as f:
        return json.load(f)


def load_mock_content() -> str:
    """Load the E2E mock file content."""
    mock_path = Path("frontend/e2e/fixtures/api-mocks.js")
    if not mock_path.exists():
        print(f"Error: Mock file not found: {mock_path}")
        sys.exit(1)

    return mock_path.read_text()


def get_required_aggregate_fields(contract: dict) -> list[str]:
    """Get required fields for aggregate endpoint from contract."""
    aggregate = contract.get("contracts", {}).get("aggregate", {})
    response_schema = aggregate.get("response_schema", {})
    data_fields = response_schema.get("data_fields", {})

    # Get fields marked as required or commonly used
    required = []
    for field_name, field_spec in data_fields.items():
        if isinstance(field_spec, dict):
            if field_spec.get("required", False):
                required.append(field_name)
        else:
            required.append(field_name)

    # Always check these core fields
    core_fields = ["count", "period", "medianPsf", "avgPsf"]
    for field in core_fields:
        if field not in required:
            required.append(field)

    return required


def get_required_filter_options_fields(contract: dict) -> list[str]:
    """Get required fields for filter-options endpoint."""
    return ["districts", "regions", "bedrooms", "saleTypes", "tenures", "dateRange"]


def get_required_kpi_fields(contract: dict) -> list[str]:
    """Get required fields for kpi-summary endpoint."""
    return ["total_transactions", "median_psf", "median_price"]


def validate_mock_fields(mock_content: str, endpoint: str, required_fields: list[str]) -> list[str]:
    """Check if mock contains required fields."""
    warnings = []

    for field in required_fields:
        # Check for camelCase and snake_case variants
        patterns = [
            rf'["\']?{field}["\']?\s*:',  # field: or "field":
            rf'["\']?{to_snake_case(field)}["\']?\s*:',  # snake_case variant
        ]

        found = False
        for pattern in patterns:
            if re.search(pattern, mock_content, re.IGNORECASE):
                found = True
                break

        if not found:
            warnings.append(f"[{endpoint}] Missing field: {field}")

    return warnings


def to_snake_case(name: str) -> str:
    """Convert camelCase to snake_case."""
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def main():
    print("E2E Mock Validation")
    print("=" * 50)

    contract = load_contract()
    mock_content = load_mock_content()

    all_warnings = []

    # Validate aggregate mock
    aggregate_fields = get_required_aggregate_fields(contract)
    print(f"\nChecking /api/aggregate mock ({len(aggregate_fields)} fields)...")
    warnings = validate_mock_fields(mock_content, "aggregate", aggregate_fields)
    all_warnings.extend(warnings)

    # Validate filter-options mock
    filter_fields = get_required_filter_options_fields(contract)
    print(f"Checking /api/filter-options mock ({len(filter_fields)} fields)...")
    warnings = validate_mock_fields(mock_content, "filter-options", filter_fields)
    all_warnings.extend(warnings)

    # Validate kpi-summary mock
    kpi_fields = get_required_kpi_fields(contract)
    print(f"Checking /api/kpi-summary mock ({len(kpi_fields)} fields)...")
    warnings = validate_mock_fields(mock_content, "kpi-summary", kpi_fields)
    all_warnings.extend(warnings)

    # Report results
    print("\n" + "=" * 50)
    if all_warnings:
        print(f"\nValidation Warnings ({len(all_warnings)} candidates):")
        for w in all_warnings:
            print(f"  - {w}")
        print("\nNote: E2E mocks may be stale. Update frontend/e2e/fixtures/api-mocks.js")
        print("      to match the current API contract.")
        return 1
    else:
        print("\nE2E mocks align with API contracts")
        return 0


if __name__ == "__main__":
    sys.exit(main())
