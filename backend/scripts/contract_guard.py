#!/usr/bin/env python3
"""
Contract Guard - Detects contract changes and blocks breaking changes.

This script:
1. Regenerates contracts from backend schemas
2. Compares against committed contracts
3. Reports added/removed/changed fields
4. Blocks breaking changes unless BREAKING_CHANGE_OK=1

Breaking change heuristics:
- Removed endpoint
- Removed field from response
- Field type changed
- Field became required (was optional)

Usage:
    python backend/scripts/contract_guard.py           # Check mode (CI)
    python backend/scripts/contract_guard.py --update  # Update and commit
    BREAKING_CHANGE_OK=1 python backend/scripts/contract_guard.py  # Allow breaking
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Any

# Ensure backend/ is in Python path
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

_REPO_ROOT = _BACKEND_ROOT.parent
_CONTRACTS_PATH = _REPO_ROOT / "frontend" / "src" / "generated" / "apiContract.json"


def load_contracts(path: Path) -> Dict[str, Any]:
    """Load contracts from JSON file."""
    if not path.exists():
        return {"contracts": {}}
    with open(path) as f:
        return json.load(f)


def get_field_type(field: Dict) -> str:
    """Extract field type as string."""
    return field.get("type", "unknown")


def extract_param_fields(param_schema: Dict) -> Dict[str, Dict]:
    """Extract param fields from either Pydantic JSON Schema or legacy format.

    Pydantic format:
        {"json_schema": {"properties": {...}, "required": [...]}, "model_name": "..."}

    Legacy format:
        {"fields": {"name": {"type": "str", "required": True, ...}}, "aliases": {...}}

    Returns a normalized dict of {field_name: {"type": str, "required": bool, ...}}
    """
    # Check for Pydantic JSON Schema format first
    if "json_schema" in param_schema:
        json_schema = param_schema["json_schema"]
        properties = json_schema.get("properties", {})
        required_fields = set(json_schema.get("required", []))

        fields = {}
        for name, prop in properties.items():
            # Extract type from JSON Schema
            # Handle anyOf (Optional types), $ref, and direct type
            if "anyOf" in prop:
                # Optional type: [{"type": "string"}, {"type": "null"}]
                types = [t.get("type") for t in prop["anyOf"] if t.get("type") != "null"]
                field_type = types[0] if types else "unknown"
            elif "$ref" in prop:
                # Reference to another definition
                ref = prop["$ref"]
                field_type = ref.split("/")[-1] if "/" in ref else ref
            else:
                field_type = prop.get("type", "unknown")

            fields[name] = {
                "type": field_type,
                "required": name in required_fields,
                "nullable": "null" in str(prop.get("anyOf", [])),
            }
        return fields

    # Fall back to legacy format
    return param_schema.get("fields", {})


def compare_fields(
    old_fields: Dict[str, Dict],
    new_fields: Dict[str, Dict],
    context: str
) -> Tuple[List[str], List[str], List[str]]:
    """Compare field dictionaries, return (added, removed, changed)."""
    added = []
    removed = []
    changed = []

    old_names = set(old_fields.keys())
    new_names = set(new_fields.keys())

    # Added fields
    for name in new_names - old_names:
        added.append(f"{context}.{name}")

    # Removed fields (BREAKING)
    for name in old_names - new_names:
        removed.append(f"{context}.{name}")

    # Changed fields
    for name in old_names & new_names:
        old_f = old_fields[name]
        new_f = new_fields[name]

        # Type change (BREAKING)
        if get_field_type(old_f) != get_field_type(new_f):
            changed.append(
                f"{context}.{name}: type {get_field_type(old_f)} -> {get_field_type(new_f)}"
            )

        # Became required (BREAKING)
        if not old_f.get("required") and new_f.get("required"):
            changed.append(f"{context}.{name}: became required")

        # Became non-nullable (BREAKING)
        if old_f.get("nullable") and not new_f.get("nullable"):
            changed.append(f"{context}.{name}: became non-nullable")

    return added, removed, changed


def compare_contracts(old: Dict, new: Dict) -> Dict[str, Any]:
    """Compare two contract manifests, return diff summary."""
    old_contracts = old.get("contracts", {})
    new_contracts = new.get("contracts", {})

    diff = {
        "added_endpoints": [],
        "removed_endpoints": [],  # BREAKING
        "added_fields": [],
        "removed_fields": [],  # BREAKING
        "changed_fields": [],  # BREAKING
        "is_breaking": False,
    }

    old_endpoints = set(old_contracts.keys())
    new_endpoints = set(new_contracts.keys())

    # Added endpoints (safe)
    diff["added_endpoints"] = sorted(new_endpoints - old_endpoints)

    # Removed endpoints (BREAKING)
    diff["removed_endpoints"] = sorted(old_endpoints - new_endpoints)

    # Compare fields for common endpoints
    for endpoint in old_endpoints & new_endpoints:
        old_c = old_contracts[endpoint]
        new_c = new_contracts[endpoint]

        # Compare response data_fields
        old_data = old_c.get("response_schema", {}).get("data_fields", {})
        new_data = new_c.get("response_schema", {}).get("data_fields", {})
        added, removed, changed = compare_fields(
            old_data, new_data, f"{endpoint}.response"
        )
        diff["added_fields"].extend(added)
        diff["removed_fields"].extend(removed)
        diff["changed_fields"].extend(changed)

        # Compare param_schema fields (handles both Pydantic and legacy formats)
        old_params = extract_param_fields(old_c.get("param_schema", {}))
        new_params = extract_param_fields(new_c.get("param_schema", {}))
        added, removed, changed = compare_fields(
            old_params, new_params, f"{endpoint}.params"
        )
        diff["added_fields"].extend(added)
        diff["removed_fields"].extend(removed)
        diff["changed_fields"].extend(changed)

    # Determine if breaking
    diff["is_breaking"] = bool(
        diff["removed_endpoints"]
        or diff["removed_fields"]
        or diff["changed_fields"]
    )

    return diff


def print_diff_summary(diff: Dict[str, Any]) -> None:
    """Print human-readable diff summary."""
    print("\n" + "=" * 60)
    print("CONTRACT DIFF SUMMARY")
    print("=" * 60)

    if diff["added_endpoints"]:
        print(f"\n+ Added endpoints ({len(diff['added_endpoints'])}):")
        for ep in diff["added_endpoints"]:
            print(f"    + {ep}")

    if diff["removed_endpoints"]:
        print(f"\n- REMOVED endpoints ({len(diff['removed_endpoints'])}) [BREAKING]:")
        for ep in diff["removed_endpoints"]:
            print(f"    - {ep}")

    if diff["added_fields"]:
        print(f"\n+ Added fields ({len(diff['added_fields'])}):")
        for f in diff["added_fields"][:10]:  # Limit output
            print(f"    + {f}")
        if len(diff["added_fields"]) > 10:
            print(f"    ... and {len(diff['added_fields']) - 10} more")

    if diff["removed_fields"]:
        print(f"\n- REMOVED fields ({len(diff['removed_fields'])}) [BREAKING]:")
        for f in diff["removed_fields"]:
            print(f"    - {f}")

    if diff["changed_fields"]:
        print(f"\n~ CHANGED fields ({len(diff['changed_fields'])}) [BREAKING]:")
        for f in diff["changed_fields"]:
            print(f"    ~ {f}")

    print("\n" + "=" * 60)
    if diff["is_breaking"]:
        print("STATUS: BREAKING CHANGES DETECTED")
        print("=" * 60)
    else:
        print("STATUS: No breaking changes")
        print("=" * 60)


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Contract guard")
    parser.add_argument("--update", action="store_true", help="Update contracts")
    args = parser.parse_args()

    # Load current committed contracts
    old_contracts = load_contracts(_CONTRACTS_PATH)

    # Generate new contracts
    from scripts.generate_contracts import main as generate_main
    generate_main()

    # Load newly generated contracts
    new_contracts = load_contracts(_CONTRACTS_PATH)

    # Compare
    diff = compare_contracts(old_contracts, new_contracts)

    # Print summary
    print_diff_summary(diff)

    # Check for changes
    has_changes = bool(
        diff["added_endpoints"]
        or diff["removed_endpoints"]
        or diff["added_fields"]
        or diff["removed_fields"]
        or diff["changed_fields"]
    )

    if not has_changes:
        print("\nNo contract changes detected.")
        return 0

    # Check breaking changes
    if diff["is_breaking"]:
        allow_breaking = os.environ.get("BREAKING_CHANGE_OK") == "1"
        if not allow_breaking:
            print("\nERROR: Breaking changes require BREAKING_CHANGE_OK=1")
            print("       Or update frontend consumers before merging.")
            return 1
        print("\nWARNING: Breaking changes allowed via BREAKING_CHANGE_OK=1")

    if args.update:
        print("\nContracts updated. Please commit the changes.")
        return 0

    # In CI mode, fail if contracts changed (need to regenerate)
    print("\nERROR: Contracts changed but not committed.")
    print("       Run: python backend/scripts/generate_contracts.py")
    print("       Then commit the generated files.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
